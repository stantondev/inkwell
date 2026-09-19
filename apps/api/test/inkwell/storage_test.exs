defmodule Inkwell.StorageTest do
  @moduledoc """
  Image storage allowances: Free 100 MB, Plus 1 GB + 1 GB per full year of
  paid Plus membership, counted in real (decoded) file bytes.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Repo, Storage}
  alias Inkwell.Accounts.User

  @gb 1_073_741_824

  # 1x1 transparent PNG
  @png_b64 "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
  @png_bytes byte_size(Base.decode64!(@png_b64))

  defp make_plus(user, since) do
    user
    |> Ecto.Changeset.change(%{
      subscription_tier: "plus",
      subscription_status: "active",
      plus_member_since: since
    })
    |> Repo.update!()
  end

  defp dt(iso) do
    {:ok, d, _} = DateTime.from_iso8601(iso)
    d
  end

  describe "limit_for/2" do
    test "free users get 100 MB" do
      assert Storage.limit_for(%User{subscription_tier: "free"}) == 100 * 1_048_576
    end

    test "new Plus members get 1 GB" do
      user = %User{subscription_tier: "plus", plus_member_since: dt("2026-09-01T00:00:00Z")}
      assert Storage.limit_for(user, dt("2026-09-19T00:00:00Z")) == @gb
    end

    test "Plus grows by 1 GB on each membership anniversary" do
      user = %User{subscription_tier: "plus", plus_member_since: dt("2026-09-19T12:00:00Z")}

      assert Storage.limit_for(user, dt("2027-09-18T23:59:00Z")) == @gb
      assert Storage.limit_for(user, dt("2027-09-19T00:00:00Z")) == 2 * @gb
      assert Storage.limit_for(user, dt("2031-10-01T00:00:00Z")) == 6 * @gb
    end

    test "Plus trial users (no membership date) get the 1 GB base" do
      user = %User{subscription_tier: "plus", plus_member_since: nil}
      assert Storage.limit_for(user) == @gb
    end

    test "a lapsed member is back on the free allowance" do
      user = %User{subscription_tier: "free", plus_member_since: dt("2020-01-01T00:00:00Z")}
      assert Storage.limit_for(user) == 100 * 1_048_576
    end
  end

  describe "summary/2" do
    test "reports the next increase date" do
      user = %User{
        id: Ecto.UUID.generate(),
        subscription_tier: "plus",
        plus_member_since: dt("2026-02-20T00:00:00Z")
      }

      s = Storage.summary(user, dt("2027-05-01T00:00:00Z"))
      assert s.plus_years == 1
      assert s.limit_bytes == 2 * @gb
      assert s.next_increase_on == ~D[2028-02-20]
    end
  end

  describe "plus_member_since stamping" do
    test "is set when an account becomes paid Plus, and never moved later" do
      user = create_user()

      {:ok, user} =
        user
        |> User.subscription_changeset(%{subscription_tier: "plus", subscription_status: "active"})
        |> Repo.update()

      first = user.plus_member_since
      assert first

      {:ok, user} =
        user
        |> User.subscription_changeset(%{subscription_tier: "free", subscription_status: "canceled"})
        |> Repo.update()

      {:ok, user} =
        user
        |> User.subscription_changeset(%{subscription_tier: "plus", subscription_status: "active"})
        |> Repo.update()

      assert user.plus_member_since == first
    end

    test "is not set by a free trial" do
      {:ok, user} =
        create_user()
        |> User.subscription_changeset(%{subscription_tier: "plus", subscription_status: "trialing"})
        |> Repo.update()

      assert is_nil(user.plus_member_since)
    end
  end

  describe "POST /api/images" do
    test "records the real file size, not the base64 length", %{conn: conn} do
      user = create_user()

      resp =
        post(log_in_user(conn, user), "/api/images", %{
          image: "data:image/png;base64,#{@png_b64}"
        })

      assert %{"data" => %{"id" => id}} = json_response(resp, 201)
      assert Inkwell.Journals.get_entry_image(id).byte_size == @png_bytes
      assert Storage.used(user.id) == @png_bytes
    end

    test "rejects an upload that would pass the allowance, with a summary", %{conn: conn} do
      user = create_user()

      # Fill the free allowance to within a few bytes of the limit.
      Repo.insert!(%Inkwell.Journals.EntryImage{
        user_id: user.id,
        data: "data:image/png;base64,AAAA",
        content_type: "image/png",
        byte_size: Storage.free_limit() - 5
      })

      resp =
        post(log_in_user(conn, user), "/api/images", %{
          image: "data:image/png;base64,#{@png_b64}"
        })

      body = json_response(resp, 422)
      assert body["error"] == "storage_limit_exceeded"
      assert body["storage"]["limit_bytes"] == Storage.free_limit()
    end

    test "rejects AVIF (not supported yet)", %{conn: conn} do
      resp =
        post(log_in_user(conn, create_user()), "/api/images", %{
          image: "data:image/avif;base64,AAAAHGZ0eXBhdmlm"
        })

      assert json_response(resp, 422)["error"] =~ "PNG, JPEG, GIF, or WebP"
    end
  end

  describe "GET /api/me/storage" do
    test "returns the member's allowance", %{conn: conn} do
      user = make_plus(create_user(), DateTime.add(DateTime.utc_now(), -400, :day))

      body = json_response(get(log_in_user(conn, user), "/api/me/storage"), 200)["data"]
      assert body["limit_bytes"] == 2 * @gb
      assert body["plus_years"] == 1
      assert body["used_bytes"] == 0
    end
  end
end
