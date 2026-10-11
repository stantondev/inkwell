defmodule InkwellWeb.AccountReportTest do
  @moduledoc """
  Reporting an account, not just an entry (Jon Henshaw's roadmap post).
  Account reports land in the admin queue, notify admins, count toward the
  spam checker, and clear their notification when resolved.
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query
  alias Inkwell.{Moderation, Repo}
  alias Inkwell.Accounts.Notification
  alias Inkwell.Moderation.Report

  defp report(conn, reporter, target, reason \\ "spam") do
    conn
    |> log_in_user(reporter)
    |> post("/api/users/#{target.username}/report", %{reason: reason, details: "Bio sells accounts"})
  end

  defp admin, do: create_user() |> Ecto.Changeset.change(role: "admin") |> Repo.update!()

  test "anyone signed in can report an account, once", %{conn: conn} do
    me = create_user()
    spammer = create_user()

    assert %{"ok" => true} = conn |> report(me, spammer) |> json_response(200)
    assert [r] = Repo.all(from r in Report, where: r.reported_user_id == ^spammer.id)
    assert r.entry_id == nil and r.reason == "spam" and r.status == "pending"
    assert Moderation.has_reported_account?(me.id, spammer.id)

    assert conn |> report(me, spammer) |> json_response(409)
  end

  test "can't report yourself; unknown accounts 404; bad reasons refused", %{conn: conn} do
    me = create_user()
    assert conn |> report(me, me) |> json_response(422)
    assert conn |> log_in_user(me) |> post("/api/users/nobody_here_xyz/report", %{reason: "spam"}) |> json_response(404)
    assert conn |> report(me, create_user(), "unlabeled_sensitive") |> json_response(422)
  end

  test "requires sign-in", %{conn: conn} do
    assert conn |> post("/api/users/#{create_user().username}/report", %{reason: "spam"}) |> json_response(401)
  end

  test "admins are notified, and resolving clears it", %{conn: conn} do
    boss = admin()
    me = create_user()
    spammer = create_user()

    conn |> report(me, spammer) |> json_response(200)

    assert [n] = Repo.all(from n in Notification, where: n.user_id == ^boss.id and n.type == :report)
    assert n.target_type == "user" and n.target_id == spammer.id and not n.read

    [r] = Repo.all(from r in Report, where: r.reported_user_id == ^spammer.id)

    rendered =
      build_conn()
      |> log_in_user(boss)
      |> get("/api/admin/reports")
      |> json_response(200)
      |> Map.fetch!("data")
      |> Enum.find(&(&1["id"] == r.id))

    assert rendered["kind"] == "account"
    assert rendered["reported_user"]["username"] == spammer.username

    {:ok, _} = Moderation.resolve_report(r, %{status: "dismissed", resolved_by: boss.id})
    assert Repo.reload(n).read
  end

  test "entry reports record the author as the reported account", %{conn: conn} do
    me = create_user()
    author = create_user()
    {:ok, entry} =
      Inkwell.Journals.create_entry(%{
        "user_id" => author.id,
        "title" => "A public entry",
        "body_html" => "<p>hi</p>",
        "privacy" => "public"
      })

    conn |> log_in_user(me) |> post("/api/entries/#{entry.id}/report", %{reason: "spam"}) |> json_response(200)

    assert [%{reported_user_id: id}] = Repo.all(from r in Report, where: r.entry_id == ^entry.id)
    assert id == author.id
  end
end
