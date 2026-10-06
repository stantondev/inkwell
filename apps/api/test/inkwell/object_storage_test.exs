defmodule Inkwell.ObjectStorageTest do
  @moduledoc """
  Uploaded images in object storage (Inkwell.ObjectStore), with Postgres as
  the fallback and the only store on servers without a bucket.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Images, ObjectStore, Repo}
  alias Inkwell.Journals.EntryImage
  alias Inkwell.ObjectStore.Memory
  alias Inkwell.Workers.{MoveImagesToObjectStoreWorker, ObjectStoreDeletionWorker}

  @png Base.decode64!(
         "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
       )
  @png_uri "data:image/png;base64," <> Base.encode64(@png)

  # A bucket that refuses every request.
  defmodule Down do
    @behaviour Inkwell.ObjectStore
    def put(_, _, _), do: {:error, :down}
    def get(_), do: {:error, :down}
    def delete(_), do: {:error, :down}
  end

  setup do
    Memory.reset()
    Application.put_env(:inkwell, :object_store_adapter, Memory)
    on_exit(fn -> Application.delete_env(:inkwell, :object_store_adapter) end)
    :ok
  end

  defp queued_deletions do
    Repo.all(from d in "object_store_deletions", select: d.key)
  end

  test "an upload goes to the bucket and the row keeps only its key", %{conn: conn} do
    user = create_user()
    conn = post(log_in_user(conn, user), "/api/images", %{"image" => @png_uri})
    %{"id" => id, "url" => url} = json_response(conn, 201)["data"]

    image = Repo.get!(EntryImage, id)
    assert image.storage_key == "images/#{id}"
    assert image.data == nil
    assert image.byte_size == byte_size(@png)
    assert {:ok, @png} = Memory.get(image.storage_key)
    assert url == "/api/images/#{id}"
  end

  test "images are served from the bucket at the same address", %{conn: conn} do
    {:ok, image} = Images.store(create_user().id, @png)
    conn = get(conn, "/api/images/#{image.id}")

    assert response(conn, 200) == @png
    assert [ct] = get_resp_header(conn, "content-type")
    assert ct =~ "image/png"
    assert [_] = get_resp_header(conn, "content-security-policy")
  end

  test "a batch upload stores every file in the bucket", %{conn: conn} do
    conn =
      post(log_in_user(conn, create_user()), "/api/images/batch", %{"images" => [@png_uri, @png_uri]})

    assert [_, _] = json_response(conn, 201)["data"]
    assert length(Memory.keys()) == 2
    assert Repo.aggregate(from(i in EntryImage, where: is_nil(i.data)), :count) == 2
  end

  test "if the bucket is down, uploads are kept in Postgres instead" do
    Application.put_env(:inkwell, :object_store_adapter, Down)
    {:ok, image} = Images.store(create_user().id, @png)

    assert image.storage_key == nil
    assert image.data == @png_uri
    assert {:ok, "image/png", @png} = Images.fetch(image)
  end

  test "without a bucket everything stays in Postgres" do
    Application.delete_env(:inkwell, :object_store_adapter)
    refute ObjectStore.configured?()

    {:ok, image} = Images.store(create_user().id, @png)
    assert image.storage_key == nil
    assert image.data == @png_uri
    assert {:error, :not_configured} = Images.move_to_object_store()
  end

  test "a moved image falls back to its Postgres copy if the bucket fails" do
    user = create_user()
    {:ok, image} = Images.insert(Images.entry_image_attrs(user.id, %{content_type: "image/png", binary: @png, data_uri: @png_uri}))
    Images.move_to_object_store()

    Application.put_env(:inkwell, :object_store_adapter, Down)
    assert {:ok, "image/png", @png} = Images.fetch(Repo.reload!(image))
  end

  test "existing images are copied to the bucket, checked, and keep their Postgres copy" do
    user = create_user()
    parsed = %{content_type: "image/png", binary: @png, data_uri: @png_uri}

    ids =
      for _ <- 1..3 do
        {:ok, img} = Images.insert(Images.entry_image_attrs(user.id, parsed))
        img.id
      end

    {:ok, _} = Oban.insert(MoveImagesToObjectStoreWorker.new(%{}))

    for id <- ids do
      image = Repo.get!(EntryImage, id)
      assert image.storage_key == "images/#{id}"
      assert image.data == @png_uri
      assert {:ok, @png} = Memory.get(image.storage_key)
    end

    assert %{moved: 0, remaining: 0} = Images.move_to_object_store()
  end

  test "old SVG icons move too, keeping their type" do
    user = create_user()
    svg = ~s|<svg xmlns="http://www.w3.org/2000/svg"></svg>|

    image =
      Repo.insert!(%EntryImage{
        user_id: user.id,
        data: "data:image/svg+xml;base64," <> Base.encode64(svg),
        content_type: "image/svg+xml",
        byte_size: byte_size(svg)
      })

    assert %{moved: 1} = Images.move_to_object_store()
    assert {:ok, "image/svg+xml", ^svg} = Images.fetch(Repo.reload!(image))
  end

  test "Postgres copies are cleared only after the waiting period, and only if the object is there" do
    user = create_user()
    parsed = %{content_type: "image/png", binary: @png, data_uri: @png_uri}
    {:ok, a} = Images.insert(Images.entry_image_attrs(user.id, parsed))
    {:ok, b} = Images.insert(Images.entry_image_attrs(user.id, parsed))
    Images.move_to_object_store()

    assert %{cleared: 0} = Images.drop_database_copies(14)

    long_ago = DateTime.add(DateTime.utc_now(), -20 * 86_400, :second)
    Repo.update_all(EntryImage, set: [updated_at: long_ago])
    Memory.delete("images/#{b.id}")

    assert %{cleared: 1, kept: 1} = Images.drop_database_copies(14)
    assert Repo.reload!(a).data == nil
    assert Repo.reload!(b).data == @png_uri
  end

  test "deleting rows queues their objects, and the worker deletes them" do
    user = create_user()
    {:ok, one} = Images.store(user.id, @png)
    {:ok, _two} = Images.store(user.id, @png)

    Repo.delete!(one)
    assert queued_deletions() == [one.storage_key]

    # An account deletion removes images by cascade; the trigger still fires.
    Repo.delete!(user)
    assert length(queued_deletions()) == 2

    assert %{deleted: 2, failed: 0} = ObjectStoreDeletionWorker.drain()
    assert Memory.keys() == []
    assert queued_deletions() == []
  end

  test "deletions that fail stay queued" do
    {:ok, image} = Images.store(create_user().id, @png)
    Repo.delete!(image)

    Application.put_env(:inkwell, :object_store_adapter, Down)
    assert %{deleted: 0, failed: 1} = ObjectStoreDeletionWorker.drain()
    assert queued_deletions() == [image.storage_key]
  end

  test "the orphan cleanup's deletions reach the bucket" do
    {:ok, image} = Images.store(create_user().id, @png)
    old = DateTime.add(DateTime.utc_now(), -2 * 86_400, :second)
    Repo.update_all(from(i in EntryImage, where: i.id == ^image.id), set: [inserted_at: old])

    assert {:ok, 1} = Inkwell.Journals.cleanup_orphaned_images()
    ObjectStoreDeletionWorker.drain()
    assert Memory.keys() == []
  end

  test "a row needs either a file in Postgres or a key" do
    user = create_user()

    assert {:error, changeset} =
             Images.insert(%{"user_id" => user.id, "content_type" => "image/png", "byte_size" => 1})

    assert changeset.errors[:data]
  end
end
