defmodule Inkwell.Moderation.ReportNotificationTest do
  @moduledoc """
  Handling a report should clear the notification that announced it.

  A report fans out one `:report` notification per admin. Before this,
  nothing in the resolve path touched them, so an admin who dismissed or
  actioned a report in the queue was left with a permanently unread
  notification — the badge stayed lit with nothing behind it.
  """
  use Inkwell.DataCase, async: false

  import Ecto.Query

  alias Inkwell.{Accounts, Factory, Journals, Moderation, Repo}
  alias Inkwell.Accounts.Notification
  alias Inkwell.Moderation.Report

  defp publish(user, title) do
    {:ok, e} =
      Journals.create_entry(%{
        "user_id" => user.id,
        "title" => title,
        "body_html" => "<p>Some words, at a reasonable length for a journal entry.</p>",
        "privacy" => "public"
      })

    e
  end

  defp report_notification(admin_id, reporter_id, entry_id) do
    {:ok, n} =
      Accounts.create_notification(%{
        type: :report,
        user_id: admin_id,
        actor_id: reporter_id,
        target_type: "entry",
        target_id: entry_id,
        data: %{reason: "content_report"}
      })

    n
  end

  defp unread?(id), do: Repo.get!(Notification, id).read == false

  defp create_report(reporter, entry) do
    {:ok, report} =
      Moderation.create_report(%{
        reporter_id: reporter.id,
        entry_id: entry.id,
        reason: "spam",
        details: "looks like spam"
      })

    report
  end

  describe "resolve_report/2" do
    setup do
      admin_a = Factory.create_user(%{username: "admin_a_#{System.unique_integer([:positive])}"})
      admin_b = Factory.create_user(%{username: "admin_b_#{System.unique_integer([:positive])}"})
      reporter = Factory.create_user()
      author = Factory.create_user()
      entry = publish(author, "A reported entry")
      report = create_report(reporter, entry)

      %{
        admin_a: admin_a,
        admin_b: admin_b,
        reporter: reporter,
        entry: entry,
        report: report
      }
    end

    test "dismissing clears the notification for every admin", ctx do
      a = report_notification(ctx.admin_a.id, ctx.reporter.id, ctx.entry.id)
      b = report_notification(ctx.admin_b.id, ctx.reporter.id, ctx.entry.id)

      assert unread?(a.id)
      assert unread?(b.id)

      {:ok, _} = Moderation.resolve_report(ctx.report, %{status: "dismissed"})

      refute unread?(a.id)
      refute unread?(b.id)
    end

    test "actioning clears it too", ctx do
      n = report_notification(ctx.admin_a.id, ctx.reporter.id, ctx.entry.id)

      {:ok, _} = Moderation.resolve_report(ctx.report, %{status: "actioned"})

      refute unread?(n.id)
    end

    test "an unrelated report's notification is left alone", ctx do
      other_reporter = Factory.create_user()
      mine = report_notification(ctx.admin_a.id, ctx.reporter.id, ctx.entry.id)
      theirs = report_notification(ctx.admin_a.id, other_reporter.id, ctx.entry.id)

      {:ok, _} = Moderation.resolve_report(ctx.report, %{status: "dismissed"})

      refute unread?(mine.id)
      assert unread?(theirs.id), "another person's report on the same entry is still open"
    end

    test "notifications of other types survive", ctx do
      {:ok, follow} =
        Accounts.create_notification(%{
          type: :follow_request,
          user_id: ctx.admin_a.id,
          actor_id: ctx.reporter.id
        })

      {:ok, _} = Moderation.resolve_report(ctx.report, %{status: "dismissed"})

      assert unread?(follow.id)
    end

    test "an already-read notification is not disturbed", ctx do
      n = report_notification(ctx.admin_a.id, ctx.reporter.id, ctx.entry.id)
      Accounts.mark_notifications_read(ctx.admin_a.id, [n.id])
      refute unread?(n.id)

      {:ok, _} = Moderation.resolve_report(ctx.report, %{status: "dismissed"})

      refute unread?(n.id)
    end
  end

  describe "mark_report_notifications_read_for_entries/1" do
    test "clears every admin's notification for the listed entries" do
      admin = Factory.create_user()
      reporter = Factory.create_user()
      author = Factory.create_user()
      one = publish(author, "First")
      two = publish(author, "Second")
      elsewhere = publish(author, "Untouched")

      a = report_notification(admin.id, reporter.id, one.id)
      b = report_notification(admin.id, reporter.id, two.id)
      c = report_notification(admin.id, reporter.id, elsewhere.id)

      Accounts.mark_report_notifications_read_for_entries([one.id, two.id])

      refute unread?(a.id)
      refute unread?(b.id)
      assert unread?(c.id)
    end

    test "an empty list is a no-op" do
      assert {0, nil} = Accounts.mark_report_notifications_read_for_entries([])
    end
  end

  describe "mark_report_notifications_read/2" do
    test "tolerates nil ids rather than matching everything" do
      admin = Factory.create_user()
      reporter = Factory.create_user()
      author = Factory.create_user()
      entry = publish(author, "Still open")
      n = report_notification(admin.id, reporter.id, entry.id)

      assert {0, nil} = Accounts.mark_report_notifications_read(nil, entry.id)
      assert {0, nil} = Accounts.mark_report_notifications_read(reporter.id, nil)

      assert unread?(n.id)
    end
  end

  describe "the admin queue" do
    test "a resolved report leaves no unread report notifications behind" do
      admin = Factory.create_user()
      reporter = Factory.create_user()
      author = Factory.create_user()
      entry = publish(author, "Reported")
      report = create_report(reporter, entry)
      report_notification(admin.id, reporter.id, entry.id)

      {:ok, _} = Moderation.resolve_report(report, %{status: "actioned", resolved_by: admin.id})

      assert 0 ==
               Repo.aggregate(
                 from(n in Notification,
                   where: n.user_id == ^admin.id and n.type == :report and n.read == false
                 ),
                 :count
               )

      assert Repo.get!(Report, report.id).status == "actioned"
    end
  end
end
