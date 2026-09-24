defmodule Inkwell.FirstEntryNudgeTest do
  use Inkwell.DataCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.{FirstEntryNudge, Repo}
  alias Inkwell.Accounts.User

  setup do
    prev = Application.get_env(:inkwell, :first_entry_nudge_enabled)
    Application.put_env(:inkwell, :first_entry_nudge_enabled, true)
    on_exit(fn -> Application.put_env(:inkwell, :first_entry_nudge_enabled, prev) end)
    :ok
  end

  # An account that signed up `days` ago and has signed in.
  defp signup(days, attrs \\ %{}) do
    u = create_user(attrs)
    ago = DateTime.add(DateTime.utc_now(), -days, :day)
    u = u |> Ecto.Changeset.change(inserted_at: ago) |> Repo.update!()
    _token = Inkwell.Auth.create_api_session_token(u.id)
    u
  end

  defp due_ids, do: FirstEntryNudge.due() |> Enum.map(& &1.id)

  test "a signed-in member 3–10 days old who hasn't written is due" do
    u = signup(5)
    assert u.id in due_ids()
  end

  test "too new, too old, or already written: not due" do
    fresh = signup(1)
    old = signup(20)
    writer = signup(5)

    {:ok, _} =
      Inkwell.Journals.create_entry(%{"user_id" => writer.id, "title" => "Hi", "body_html" => "<p>x</p>", "privacy" => "private"})

    ids = due_ids()
    refute fresh.id in ids
    refute old.id in ids
    refute writer.id in ids
  end

  test "never signed in, spam-limited, email off, or fediverse address: not due" do
    never = create_user() |> Ecto.Changeset.change(inserted_at: DateTime.add(DateTime.utc_now(), -5, :day)) |> Repo.update!()
    limited = signup(5) |> Ecto.Changeset.change(moderation_state: "limited") |> Repo.update!()
    off = signup(5) |> Ecto.Changeset.change(settings: %{"email_notifications_disabled" => true}) |> Repo.update!()
    fedi = signup(5, %{email: "someone@mastodon.social.fediverse.inkwell.social"})

    ids = due_ids()
    for u <- [never, limited, off, fedi], do: refute(u.id in ids)
  end

  test "sends once, then never again" do
    u = signup(5)

    Oban.Testing.with_testing_mode(:inline, fn ->
      assert FirstEntryNudge.enqueue_due() >= 1
    end)

    assert Repo.get!(User, u.id).settings["first_entry_nudge_sent_at"]
    refute u.id in due_ids()
  end

  test "switched off: nothing is queued" do
    Application.put_env(:inkwell, :first_entry_nudge_enabled, false)
    signup(5)
    assert FirstEntryNudge.enqueue_due() == 0
  end

  test "the email is in plain words and links to the editor" do
    {subject, body} = FirstEntryNudge.content(%User{display_name: "Maeva Var", username: "maeva"})
    assert subject == "Your first page on Inkwell"
    assert body =~ "Hey Maeva!"
    assert body =~ "/editor"
    refute body =~ "—"
  end
end
