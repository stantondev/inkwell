defmodule Inkwell.Moderation.AutoModerationTest do
  use Inkwell.DataCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  import Ecto.Query

  alias Inkwell.Accounts.User
  alias Inkwell.Journals
  alias Inkwell.Journals.Entry
  alias Inkwell.Moderation.{AutoModeration, ModerationAction}
  alias Inkwell.Repo

  setup do
    prev = Application.get_env(:inkwell, :auto_moderation_mode)
    Application.put_env(:inkwell, :auto_moderation_mode, :enforce)
    on_exit(fn -> Application.put_env(:inkwell, :auto_moderation_mode, prev || :dry_run) end)
    :ok
  end

  defp publish(user, title, body) do
    {:ok, e} =
      Journals.create_entry(%{
        "user_id" => user.id,
        "title" => title,
        "body_html" => body,
        "privacy" => "public"
      })

    e
  end

  defp spammer do
    u = create_user(%{email: "spotty_#{System.unique_integer([:positive])}@hidingmail.net"})
    publish(u, "Master the Descent", ~s(<p>Play the slope game at <a href="https://slopegamefree.com">slopegamefree.com</a></p>))
    u
  end

  defp writer do
    u = create_user()
    publish(u, "Moving day", "<p>The dog hates the new stairs.</p>")
    u
  end

  test "scan blocks a spammer, hides their posts, and leaves a real writer alone" do
    spam = spammer()
    real = writer()

    Oban.Testing.with_testing_mode(:manual, fn ->
      summary = AutoModeration.scan_user(spam.id)
      assert summary.blocked == [spam.username]
      assert AutoModeration.scan_user(real.id).blocked == []
    end)

    spam = Repo.reload!(spam)
    assert spam.blocked_at
    assert Repo.all(from e in Entry, where: e.user_id == ^spam.id, select: e.status) == [:hidden]

    assert %ModerationAction{action: "block", automated: true} =
             Repo.one(from a in ModerationAction, where: a.user_id == ^spam.id)

    assert is_nil(Repo.reload!(real).blocked_at)
    assert Repo.all(from e in Entry, where: e.user_id == ^real.id, select: e.status) == [:published]

    explore_ids = Journals.list_public_explore_entries(per_page: 50) |> Enum.map(& &1.user_id)
    refute spam.id in explore_ids
    assert real.id in explore_ids
  end

  test "undo restores exactly what was hidden and protects the account from re-scans" do
    spam = spammer()
    Oban.Testing.with_testing_mode(:manual, fn -> AutoModeration.scan_user(spam.id) end)

    action = Repo.one!(from a in ModerationAction, where: a.user_id == ^spam.id)
    admin = create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()

    Oban.Testing.with_testing_mode(:manual, fn ->
      assert {:ok, 1} = AutoModeration.undo(action, admin)
      assert {:error, :already_reversed} = AutoModeration.undo(Repo.reload!(action), admin)
    end)

    spam = Repo.reload!(spam)
    assert is_nil(spam.blocked_at)
    assert spam.moderation_cleared_at
    assert Repo.all(from e in Entry, where: e.user_id == ^spam.id, select: e.status) == [:published]

    Oban.Testing.with_testing_mode(:manual, fn ->
      summary = AutoModeration.scan_user(spam.id)
      assert summary.blocked == []
      # Cleared means left alone quietly — no daily "needs review" alert.
      assert summary.review == []
      assert {:exempt, _} = AutoModeration.evaluate(Repo.reload!(spam))
    end)

    assert is_nil(Repo.reload!(spam).blocked_at)
  end

  test "paying members are never blocked automatically, only flagged" do
    spam =
      spammer()
      |> User.subscription_changeset(%{subscription_tier: "plus", subscription_status: "active", square_subscription_id: "sq"})
      |> Repo.update!()

    Oban.Testing.with_testing_mode(:manual, fn ->
      summary = AutoModeration.scan_user(spam.id)
      assert summary.blocked == []
      assert summary.review == [spam.username]
    end)

    assert is_nil(Repo.reload!(spam).blocked_at)
  end

  test "dry run changes nothing" do
    Application.put_env(:inkwell, :auto_moderation_mode, :dry_run)
    spam = spammer()

    Oban.Testing.with_testing_mode(:manual, fn ->
      assert AutoModeration.scan_user(spam.id).blocked == [spam.username]
    end)

    assert is_nil(Repo.reload!(spam).blocked_at)
    assert Repo.all(from e in Entry, where: e.user_id == ^spam.id, select: e.status) == [:published]
  end

  test "limited accounts are kept out of Explore but keep their posts" do
    u = create_user()
    e = publish(u, "Hello", "<p>hi</p>")
    {:ok, _} = AutoModeration.limit!(u, %{score: 5, reasons: ["test"]})

    refute e.id in Enum.map(Journals.list_public_explore_entries(per_page: 50), & &1.id)
    assert Repo.reload!(e).status == :published
  end

  test "illegal-content report from an established member hides the entry right away" do
    author = writer()
    entry = Repo.one!(from e in Entry, where: e.user_id == ^author.id)

    reporter = create_user()
    reporter |> Ecto.Changeset.change(inserted_at: DateTime.add(DateTime.utc_now(), -60, :day)) |> Repo.update!()
    publish(Repo.reload!(reporter), "Mine", "<p>x</p>")
    reporter = Repo.reload!(reporter)

    {:ok, report} =
      Inkwell.Moderation.create_report(%{reporter_id: reporter.id, entry_id: entry.id, reason: "csam_illegal"})

    Oban.Testing.with_testing_mode(:manual, fn ->
      AutoModeration.handle_new_report(report, reporter)
    end)

    assert Repo.reload!(entry).status == :hidden
    assert is_nil(Repo.reload!(author).blocked_at)
    assert Repo.one(from a in ModerationAction, where: a.entry_id == ^entry.id and a.action == "hide_entry")
  end

  test "blocked users' comments are hidden from entry pages" do
    author = writer()
    entry = Repo.one!(from e in Entry, where: e.user_id == ^author.id)
    commenter = create_user()
    {:ok, _} = Journals.create_comment(%{"entry_id" => entry.id, "user_id" => commenter.id, "body_html" => "<p>hi</p>"})
    assert length(Journals.list_comments(entry.id)) == 1

    {:ok, _} = Inkwell.Accounts.block_user(commenter)
    assert Journals.list_comments(entry.id) == []
  end

  test "admin block hides posts and admin unblock restores them" do
    real = writer()
    admin = create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()

    Oban.Testing.with_testing_mode(:manual, fn ->
      {:ok, blocked} = Inkwell.Accounts.block_user(real)
      AutoModeration.after_manual_block(blocked, "blocked by @admin")
      assert Repo.all(from e in Entry, where: e.user_id == ^real.id, select: e.status) == [:hidden]

      {:ok, unblocked} = Inkwell.Accounts.unblock_user(Repo.reload!(real))
      assert {:ok, 1} = AutoModeration.after_manual_unblock(unblocked, admin)
    end)

    assert Repo.all(from e in Entry, where: e.user_id == ^real.id, select: e.status) == [:published]
    assert is_nil(Repo.reload!(real).blocked_at)
  end

end
