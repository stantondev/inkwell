defmodule Inkwell.ImagesTest do
  @moduledoc """
  Every upload path saves images through Inkwell.Images: PNG, JPEG, GIF and
  WebP only, decided by the file's own bytes. Before 2026-10-06 Post by Email,
  the importer and PATCH /api/me accepted anything calling itself an image,
  including SVG, which would have run scripts on inkwell.social when opened.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Images, Repo}
  alias Inkwell.Journals.EntryImage

  # 1x1 transparent PNG
  @png Base.decode64!(
         "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
       )
  @svg ~s|<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><script>alert(1)</script></svg>|

  # 4x3 AVIF made with sharp
  @avif Base.decode64!(
          "AAAAHGZ0eXBhdmlmAAAAAG1pZjFhdmlmbWlhZgAAANZtZXRhAAAAAAAAACFoZGxyAAAAAAAAAABwaWN0AAAAAAAAAAAAAAAAAAAAAA5waXRtAAAAAAABAAAAImlsb2MAAAAAREAAAQABAAAAAAD6AAEAAAAAAAAAHAAAACNpaW5mAAAAAAABAAAAFWluZmUCAAAAAAEAAGF2MDEAAAAAVmlwcnAAAAA4aXBjbwAAAAxhdjFDgSACAAAAABRpc3BlAAAAAAAAAAQAAAADAAAAEHBpeGkAAAAAAwgICAAAABZpcG1hAAAAAAAAAAEAAQOBAgMAAAAkbWRhdBIACgg4BHmEBDQaQDIOGAAAAEAAsBNX1kFjIPA="
        )

  # Same container as AVIF, different format: an HEIC ftyp box.
  @heic <<0, 0, 0, 24, "ftypheic", 0, 0, 0, 0, "mif1heic", 0, 0, 0, 8, "meta">>

  defp uri(type, bytes), do: "data:image/#{type};base64," <> Base.encode64(bytes)

  describe "detect_type/1" do
    test "recognises the four formats by their bytes" do
      assert Images.detect_type(@png) == "png"
      assert Images.detect_type(<<0xFF, 0xD8, 0xFF, 0xE0, 0, 0>>) == "jpeg"
      assert Images.detect_type("GIF89a" <> <<0, 0>>) == "gif"
      assert Images.detect_type("RIFF" <> <<0, 0, 0, 0>> <> "WEBPVP8 ") == "webp"
    end

    test "recognises AVIF by its ftyp brands, but not HEIC" do
      assert Images.detect_type(@avif) == "avif"
      assert Images.detect_type(<<0, 0, 0, 20, "ftypmif1", 0, 0, 0, 0, "avis">>) == "avif"
      assert Images.detect_type(@heic) == nil
      # A box claiming to be longer than the file
      assert Images.detect_type(<<0, 0, 0, 28, "ftypavif">>) == nil
    end

    test "anything else is nil" do
      assert Images.detect_type(@svg) == nil
      assert Images.detect_type("<html></html>") == nil
      assert Images.detect_type("") == nil
    end
  end

  describe "parse_data_uri/2" do
    test "accepts a real PNG and rebuilds the URI from the detected type" do
      assert {:ok, %{type: "png", content_type: "image/png", data_uri: data_uri, binary: @png}} =
               Images.parse_data_uri(uri("png", @png))

      assert data_uri == uri("png", @png)
    end

    test "refuses SVG, whatever it is called" do
      assert {:error, :invalid} = Images.parse_data_uri(uri("svg+xml", @svg))
      assert {:error, {:mismatch, "png", nil}} = Images.parse_data_uri(uri("png", @svg))
    end

    test "refuses a file whose bytes don't match its label" do
      assert {:error, {:mismatch, "jpeg", "png"}} = Images.parse_data_uri(uri("jpg", @png))
    end

    test "refuses files over the limit" do
      assert {:error, :too_large} = Images.parse_data_uri(uri("png", @png), 10)
    end

    test "refuses broken base64 and non-strings" do
      assert {:error, :bad_base64} = Images.parse_data_uri("data:image/png;base64,***")
      assert {:error, :invalid} = Images.parse_data_uri(nil)
      assert {:error, :invalid} = Images.parse_data_uri("https://example.com/a.png")
    end
  end

  describe "store/3" do
    test "saves real bytes with the detected type and the real size" do
      user = create_user()
      assert {:ok, image} = Images.store(user.id, @png, filename: "dot.png")
      assert image.content_type == "image/png"
      assert image.byte_size == byte_size(@png)
      assert image.data == uri("png", @png)
      assert image.filename == "dot.png"
    end

    test "refuses SVG" do
      user = create_user()
      assert {:error, :unsupported} = Images.store(user.id, @svg)
      assert Repo.aggregate(EntryImage, :count) == 0
    end
  end

  describe "AVIF" do
    test "entry images accept it", %{conn: conn} do
      user = create_user()
      conn = post(log_in_user(conn, user), "/api/images", %{"image" => uri("avif", @avif)})
      %{"id" => id} = json_response(conn, 201)["data"]

      image = Repo.get!(EntryImage, id)
      assert image.content_type == "image/avif"
      assert image.byte_size == byte_size(@avif)

      served = get(build_conn(), "/api/images/#{id}")
      assert response(served, 200) == @avif
      assert [ct] = get_resp_header(served, "content-type")
      assert ct =~ "image/avif"
    end

    test "Post by Email and the importer accept it (raw bytes)" do
      assert {:ok, %{type: "avif"}} = Images.parse_binary(@avif)
    end

    test "avatars, banners and backgrounds don't", %{conn: conn} do
      user = create_user()

      res = post(log_in_user(conn, user), "/api/me/avatar", %{"image" => uri("avif", @avif)})
      assert json_response(res, 422)

      res = patch(log_in_user(conn, user), "/api/me", %{"profile_banner_url" => uri("avif", @avif)})
      assert json_response(res, 422)

      assert {:error, :invalid} = Images.parse_data_uri(uri("avif", @avif), 1_000_000, Images.classic_types())
    end

    test "an HEIC file labelled AVIF is refused" do
      assert {:error, {:mismatch, "avif", nil}} = Images.parse_data_uri(uri("avif", @heic))
    end
  end

  describe "decode_stored/1" do
    test "only hands back accepted formats" do
      assert {:ok, "image/png", @png} = Images.decode_stored(uri("png", @png))
      assert :error = Images.decode_stored(uri("svg+xml", @svg))
      assert :error = Images.decode_stored(nil)
    end
  end

  describe "Post by Email" do
    setup do
      user =
        create_user()
        |> Ecto.Changeset.change(%{
          subscription_tier: "plus",
          subscription_status: "active",
          post_email_token: "tok#{System.unique_integer([:positive])}"
        })
        |> Repo.update!()

      %{user: user}
    end

    test "skips an SVG attachment and stores a PNG at its real size", %{user: user} do
      payload = %{
        "To" => "post+#{user.post_email_token}@post.inkwell.social",
        "Subject" => "Pictures",
        "TextBody" => "Hello there",
        "Attachments" => [
          %{"Name" => "evil.svg", "ContentType" => "image/svg+xml", "Content" => Base.encode64(@svg)},
          %{"Name" => ~s(dot".png), "ContentType" => "image/png", "Content" => Base.encode64(@png)}
        ]
      }

      assert {:ok, entry} = Inkwell.PostByEmail.process_inbound_email(payload)
      assert entry.cover_image_id == nil

      [image] = Repo.all(EntryImage)
      assert image.content_type == "image/png"
      assert image.byte_size == byte_size(@png)
      assert entry.body_html =~ "/api/images/#{image.id}"
      refute entry.body_html =~ ~s(dot".png)
    end

    test "an attachment labelled PNG that is really SVG is skipped", %{user: user} do
      payload = %{
        "To" => "post+#{user.post_email_token}@post.inkwell.social",
        "Subject" => "Sneaky",
        "TextBody" => "Hello",
        "Attachments" => [
          %{"Name" => "x.png", "ContentType" => "image/png", "Content" => Base.encode64(@svg)}
        ]
      }

      assert {:ok, entry} = Inkwell.PostByEmail.process_inbound_email(payload)
      assert entry.cover_image_id == nil
      assert Repo.aggregate(EntryImage, :count) == 0
    end
  end

  describe "uploads and serving" do
    test "POST /api/images refuses SVG", %{conn: conn} do
      conn = post(log_in_user(conn, create_user()), "/api/images", %{"image" => uri("png", @svg)})
      assert json_response(conn, 422)["error"] =~ "does not match"
    end

    test "POST /api/images stores a PNG", %{conn: conn} do
      conn = post(log_in_user(conn, create_user()), "/api/images", %{"image" => uri("png", @png)})
      assert %{"id" => _} = json_response(conn, 201)["data"]
    end

    test "served images carry nosniff and a sandboxing CSP", %{conn: conn} do
      user = create_user()
      {:ok, image} = Images.store(user.id, @png)
      conn = get(conn, "/api/images/#{image.id}")

      assert response(conn, 200) == @png
      assert get_resp_header(conn, "x-content-type-options") == ["nosniff"]
      assert [csp] = get_resp_header(conn, "content-security-policy")
      assert csp =~ "sandbox"
    end

    test "an old stored SVG is only served sandboxed", %{conn: conn} do
      user = create_user()

      image =
        Repo.insert!(%EntryImage{
          user_id: user.id,
          data: uri("svg+xml", @svg),
          content_type: "image/svg+xml",
          byte_size: byte_size(@svg)
        })

      conn = get(conn, "/api/images/#{image.id}")
      assert response(conn, 200)
      assert [csp] = get_resp_header(conn, "content-security-policy")
      assert csp =~ "sandbox"
      assert csp =~ "default-src 'none'"
    end
  end

  describe "PATCH /api/me image fields" do
    test "refuses an SVG avatar", %{conn: conn} do
      user = create_user()

      conn = patch(log_in_user(conn, user), "/api/me", %{"avatar_url" => uri("svg+xml", @svg)})
      assert json_response(conn, 422)["error"] =~ "PNG, JPEG, GIF or WebP"
      assert Repo.reload!(user).avatar_url == nil
    end

    test "refuses an SVG labelled as PNG, and non-image strings", %{conn: conn} do
      user = create_user()

      for bad <- [uri("png", @svg), "javascript:alert(1)", "https://example.com/a.svg"] do
        res = patch(log_in_user(conn, user), "/api/me", %{"profile_banner_url" => bad})
        assert json_response(res, 422)
      end

      assert Repo.reload!(user).profile_banner_url == nil
    end

    test "accepts a real PNG avatar and clearing it", %{conn: conn} do
      user = create_user()

      res = patch(log_in_user(conn, user), "/api/me", %{"avatar_url" => uri("png", @png)})
      assert json_response(res, 200)
      assert Repo.reload!(user).avatar_url == uri("png", @png)

      res = patch(log_in_user(conn, user), "/api/me", %{"avatar_url" => ""})
      assert json_response(res, 200)
      assert Repo.reload!(user).avatar_url in [nil, ""]
    end

    test "echoing back the stored value always works, even for an older upload", %{conn: conn} do
      # An upload from before magic-byte checks: labelled PNG, actually JPEG.
      old = "data:image/png;base64," <> Base.encode64(<<0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3>>)

      user =
        create_user() |> Ecto.Changeset.change(%{profile_background_url: old}) |> Repo.update!()

      res =
        patch(log_in_user(conn, user), "/api/me", %{
          "profile_background_url" => old,
          "display_name" => "Still Me"
        })

      assert json_response(res, 200)
      assert Repo.reload!(user).display_name == "Still Me"
      assert Repo.reload!(user).profile_background_url == old
    end

    test "the avatar route never serves a non-image type", %{conn: conn} do
      user =
        create_user()
        |> Ecto.Changeset.change(%{avatar_url: uri("svg+xml", @svg)})
        |> Repo.update!()

      conn = get(conn, "/api/avatars/#{user.username}")
      assert json_response(conn, 404)
    end

    test "the avatar route serves a PNG with the safety headers", %{conn: conn} do
      user = create_user() |> Ecto.Changeset.change(%{avatar_url: uri("png", @png)}) |> Repo.update!()

      conn = get(conn, "/api/avatars/#{user.username}")
      assert response(conn, 200) == @png
      assert get_resp_header(conn, "x-content-type-options") == ["nosniff"]
      assert [_] = get_resp_header(conn, "content-security-policy")
    end
  end
end
