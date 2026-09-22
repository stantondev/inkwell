defmodule Inkwell.AvatarsImportTest do
  use ExUnit.Case, async: true
  alias Inkwell.Avatars

  test "Mastodon's default placeholder means no avatar" do
    assert Avatars.import_remote("https://mastodon.social/avatars/original/missing.png") == :none
  end

  test "refuses non-https and missing URLs" do
    assert {:error, :not_https} = Avatars.import_remote("http://example.com/a.png")
    assert {:error, :no_url} = Avatars.import_remote(nil)
  end

  test "internal addresses are never fetched" do
    assert {:error, :blocked_url} = Avatars.import_remote("https://127.0.0.1/a.png")
  end
end
