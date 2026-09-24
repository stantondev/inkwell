defmodule Inkwell.MentionSearchTest do
  @moduledoc """
  @mention autocomplete must find people who haven't signed in lately:
  tagging a quiet friend is how they get pulled back in. Until 2026-09-24 it
  hid anyone inactive for 30 days (reported trying to tag a sister).
  """
  use Inkwell.DataCase, async: true

  import Ecto.Query
  alias Inkwell.Accounts
  alias Inkwell.Accounts.User

  defp set_user(user, fields) do
    from(u in User, where: u.id == ^user.id) |> Repo.update_all(set: fields)
  end

  defp names(results), do: Enum.map(results, & &1.username)

  test "finds someone who hasn't been active in months" do
    quiet = create_user(%{username: "jessiquiet", display_name: "Jessi"})
    set_user(quiet, last_active_at: DateTime.add(DateTime.utc_now(), -200, :day))

    assert "jessiquiet" in names(Accounts.search_users_by_prefix("jess"))
  end

  test "leaves out suspended accounts" do
    spam = create_user(%{username: "jessispam"})
    set_user(spam, blocked_at: DateTime.utc_now())

    refute "jessispam" in names(Accounts.search_users_by_prefix("jess"))
  end

  test "matches the start of a word in the display name and ignores a leading @" do
    create_user(%{username: "kupikinz_q", display_name: "Jessica Kupikinz"})

    assert "kupikinz_q" in names(Accounts.search_users_by_prefix("@kupik"))
    assert "kupikinz_q" in names(Accounts.search_users_by_prefix("jessica"))
    refute "kupikinz_q" in names(Accounts.search_users_by_prefix("pikinz"))
  end

  test "username matches come before display-name matches" do
    create_user(%{username: "zzz_other", display_name: "Mar Tello"})
    create_user(%{username: "martell"})

    assert ["martell" | _] = names(Accounts.search_users_by_prefix("mar"))
  end

  test "treats % and _ literally" do
    create_user(%{username: "abc_def"})
    create_user(%{username: "abcxdef"})

    assert names(Accounts.search_users_by_prefix("abc_")) == ["abc_def"]
    assert names(Accounts.search_users_by_prefix("%")) == []
  end

  test "returns avatar URLs, not stored images" do
    u = create_user(%{username: "picperson"})
    set_user(u, avatar_url: "data:image/png;base64,AAAA")

    [hit] = Accounts.search_users_by_prefix("picperson")
    assert hit.avatar_url =~ "/api/avatars/picperson"
  end
end
