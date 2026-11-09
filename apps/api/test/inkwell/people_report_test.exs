defmodule Inkwell.PeopleReportTest do
  @moduledoc """
  Admin → Users (Inkwell.Accounts.PeopleReport): every account lands in the
  right spam / activity / engagement bucket, the lists behind the numbers use
  the same rules, and admins are left out.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo}
  alias Inkwell.Accounts.PeopleReport

  defp change!(user, attrs), do: user |> Ecto.Changeset.change(attrs) |> Repo.update!()

  defp post!(user, attrs \\ %{}) do
    {:ok, entry} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "A post #{System.unique_integer([:positive])}",
            body_html: "<p>Some words about the weather and the garden today.</p>",
            privacy: :public,
            status: :published,
            published_at: DateTime.utc_now()
          },
          attrs
        )
      )

    entry
  end

  defp ink!(user, entry) do
    Repo.insert!(%Inkwell.Inks.Ink{user_id: user.id, entry_id: entry.id})
  end

  defp usernames(bucket), do: PeopleReport.members(bucket).data |> Enum.map(& &1.username) |> MapSet.new()

  defp in?(bucket, user), do: MapSet.member?(usernames(bucket), user.username)

  setup do
    now = DateTime.utc_now()
    writer = create_user() |> change!(last_active_at: now, settings: %{"onboarded" => true})
    reader = create_user() |> change!(last_active_at: DateTime.add(now, -20, :day))
    lurker = create_user()
    spam = create_user() |> change!(blocked_at: now)
    limited = create_user() |> change!(moderation_state: "limited", last_active_at: now)
    admin = create_user() |> change!(role: "admin", last_active_at: now)

    entry = post!(writer)
    ink!(reader, entry)
    post!(admin)

    %{writer: writer, reader: reader, lurker: lurker, spam: spam, limited: limited, admin: admin, entry: entry}
  end

  test "spam and member buckets", ctx do
    assert in?("suspended", ctx.spam)
    assert in?("limited", ctx.limited)
    refute in?("members", ctx.spam)
    refute in?("members", ctx.limited)
    assert in?("members", ctx.writer)
    assert in?("members", ctx.lurker)
  end

  test "admins are left out of everything", ctx do
    report = PeopleReport.report()
    assert report.admins >= 1

    for bucket <- PeopleReport.bucket_keys() do
      refute in?(bucket, ctx.admin), "admin showed up in #{bucket}"
    end
  end

  test "activity buckets follow last_active_at and sessions", ctx do
    assert in?("active_7", ctx.writer)
    refute in?("active_7", ctx.reader)
    assert in?("active_30", ctx.reader)
    assert in?("never_signed_in", ctx.lurker)
    refute in?("never_signed_in", ctx.reader)
    assert in?("not_onboarded", ctx.reader)
    refute in?("not_onboarded", ctx.writer)
    assert in?("never_wrote", ctx.reader)
    refute in?("never_wrote", ctx.writer)

    Inkwell.Auth.create_api_session_token(ctx.lurker.id)
    refute in?("never_signed_in", ctx.lurker)
  end

  test "engagement: posting vs interacting, and responses", ctx do
    assert in?("posted_only", ctx.writer)
    assert in?("interacted_only", ctx.reader)
    assert in?("neither", ctx.lurker)
    assert in?("answered", ctx.writer)

    # The writer inks the reader's post: now they do both, and the reader's
    # post is unanswered until someone responds.
    reader_post = post!(ctx.reader)
    ink!(ctx.writer, reader_post)

    assert in?("both", ctx.writer)
    assert in?("both", ctx.reader)
    refute in?("posted_only", ctx.writer)
    assert in?("answered", ctx.reader)

    loner = create_user()
    post!(loner)
    assert in?("unanswered", loner)
  end

  test "commenting on your own post isn't interacting, and drafts aren't posting", ctx do
    {:ok, _} = Journals.create_comment(%{"entry_id" => ctx.entry.id, "user_id" => ctx.writer.id, "body_html" => "<p>Thanks all</p>"})
    assert in?("posted_only", ctx.writer)
    assert in?("unanswered", ctx.lurker) == false

    drafter = create_user()
    {:ok, _} = Journals.create_draft(%{user_id: drafter.id, title: "Draft", body_html: "<p>hi</p>"})
    assert in?("drafts_only", drafter)
    assert in?("neither", drafter)
  end

  test "counts match the lists", _ctx do
    report = PeopleReport.report()

    for bucket <- PeopleReport.bucket_keys() do
      assert report.counts[bucket] == PeopleReport.members(bucket).total, "#{bucket} count differs from its list"
    end
  end

  test "the endpoint is admin-only and refuses unknown groups", %{conn: conn} = ctx do
    assert conn |> log_in_user(ctx.writer) |> get("/api/admin/users-overview") |> json_response(403)

    body = conn |> log_in_user(ctx.admin) |> get("/api/admin/users-overview") |> json_response(200)
    assert body["data"]["counts"]["suspended"] >= 1
    assert length(body["data"]["weeks"]) == 12

    list = conn |> log_in_user(ctx.admin) |> get("/api/admin/users-overview/members?bucket=posted_only") |> json_response(200)
    assert Enum.any?(list["data"], &(&1["username"] == ctx.writer.username))
    row = Enum.find(list["data"], &(&1["username"] == ctx.writer.username))
    assert row["published"] == 1 and row["received"] == 1 and row["given"] == 0

    assert conn |> log_in_user(ctx.admin) |> get("/api/admin/users-overview/members?bucket=nope") |> json_response(400)
  end

  describe "new writers" do
    defp new_writer_item(user), do: Enum.find(PeopleReport.report().new_writers.items, &(&1.username == user.username))

    test "a real writer's first entry is listed, and only the first", ctx do
      second = post!(ctx.writer)

      item = new_writer_item(ctx.writer)
      assert item.path == "/#{ctx.writer.username}/#{ctx.entry.slug}"
      refute item.path =~ second.slug
      assert item.replies == 0
      assert item.first_reply == nil
      assert item.inks == 1
      refute String.starts_with?(item.avatar_url || "", "data:")
    end

    test "a reply from someone else counts; the writer's own doesn't", ctx do
      {:ok, _} = Journals.create_comment(%{"user_id" => ctx.writer.id, "entry_id" => ctx.entry.id, "body_html" => "<p>Thanks for reading</p>"})
      assert new_writer_item(ctx.writer).replies == 0

      {:ok, _} = Journals.create_comment(%{"user_id" => ctx.reader.id, "entry_id" => ctx.entry.id, "body_html" => "<p>I loved this</p>"})
      item = new_writer_item(ctx.writer)
      assert item.replies == 1
      assert item.first_reply.name == "@#{ctx.reader.username}"
    end

    test "spam, admins and old first entries are left out", ctx do
      post!(ctx.spam)
      post!(ctx.limited)
      old = create_user()
      post!(old, %{published_at: DateTime.add(DateTime.utc_now(), -15, :day)})

      refute new_writer_item(ctx.spam)
      refute new_writer_item(ctx.limited)
      refute new_writer_item(ctx.admin)
      refute new_writer_item(old)
    end
  end
end
