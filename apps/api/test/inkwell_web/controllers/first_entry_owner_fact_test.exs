defmodule InkwellWeb.FirstEntryOwnerFactTest do
  @moduledoc """
  The entry page tells a writer when an entry is their first, so the note
  after publishing can say so (and mention inviting people, which onboarding
  no longer asks about). Only the writer sees it.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals.Entry
  alias Inkwell.Repo

  defp published(user, slug, days_ago) do
    Repo.insert!(%Entry{
      user_id: user.id,
      title: slug,
      slug: slug,
      body_html: "<p>some words here</p>",
      status: :published,
      privacy: :public,
      published_at: DateTime.add(DateTime.utc_now(), -days_ago * 86_400, :second)
    })
  end

  defp show(conn, user, slug) do
    conn |> get("/api/users/#{user.username}/entries/#{slug}") |> json_response(200)
  end

  test "the writer's first entry says so, a later one doesn't" do
    writer = create_user()
    published(writer, "first", 3)
    published(writer, "second", 1)

    assert show(build_conn() |> log_in_user(writer), writer, "first")["data"]["first_entry"] == true
    assert show(build_conn() |> log_in_user(writer), writer, "second")["data"]["first_entry"] == false
  end

  test "readers never see it" do
    writer = create_user()
    published(writer, "first", 1)

    refute Map.has_key?(show(build_conn() |> log_in_user(create_user()), writer, "first")["data"], "first_entry")
  end
end
