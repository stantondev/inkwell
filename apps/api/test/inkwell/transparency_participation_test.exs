defmodule Inkwell.TransparencyParticipationTest do
  @moduledoc """
  The public participation numbers on /transparency: who gets counted, what a
  response is, and what "came back within 30 days" means.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.{Journals, Repo}
  alias Inkwell.Transparency.Participation

  # Late enough that September's 30 days are over and October's aren't.
  @today ~D[2026-11-09]

  defp at(date, time \\ ~T[12:00:00.000000]), do: DateTime.new!(date, time, "Etc/UTC")

  defp member(attrs \\ []) do
    create_user() |> Ecto.Changeset.change([{:inserted_at, at(~D[2026-06-01])} | attrs]) |> Repo.update!()
  end

  defp post!(user, date, attrs \\ %{}) do
    {:ok, entry} =
      Journals.create_entry(
        Map.merge(
          %{
            user_id: user.id,
            title: "A post #{System.unique_integer([:positive])}",
            body_html: "<p>Some words about the weather and the garden today.</p>",
            privacy: :public,
            status: :published,
            published_at: at(date)
          },
          attrs
        )
      )

    entry
  end

  defp comment!(user, entry, date) do
    {:ok, c} = Journals.create_comment(%{"user_id" => user.id, "entry_id" => entry.id, "body_html" => "<p>I read this.</p>"})
    c |> Ecto.Changeset.change(inserted_at: at(date)) |> Repo.update!()
  end

  defp ink!(user, entry, date) do
    Repo.insert!(%Inkwell.Inks.Ink{user_id: user.id, entry_id: entry.id, inserted_at: at(date)})
  end

  defp month(date) do
    {:ok, months} = Participation.compute(@today)
    Enum.find(months, &(&1.month == date))
  end

  @september ~D[2026-09-01]
  @october ~D[2026-10-01]

  test "only finished months, once their posts have had a week" do
    assert Participation.finished_months(~D[2026-11-09]) |> hd() == @october
    assert Participation.finished_months(~D[2026-11-08]) |> hd() == @october
    assert Participation.finished_months(~D[2026-11-07]) |> hd() == @september
    assert Participation.finished_months(~D[2026-11-09]) |> length() == 6
  end

  test "writers, returning writers and posts" do
    old = member()
    post!(old, ~D[2026-08-10])
    post!(old, ~D[2026-09-10])
    post!(old, ~D[2026-09-11])

    new = member()
    post!(new, ~D[2026-09-20])

    m = month(@september)
    assert m.writers == 2
    assert m.returning_writers == 1
    assert m.posts == 3
    assert m.first_time_writers == 1
  end

  test "a response is someone else's footnote, ink or stamp within a week" do
    writer = member()
    reader = member()
    answered = post!(writer, ~D[2026-09-10])
    inked = post!(writer, ~D[2026-09-11])
    too_late = post!(writer, ~D[2026-09-12])
    talking_to_myself = post!(writer, ~D[2026-09-13])

    comment!(reader, answered, ~D[2026-09-11])
    ink!(reader, inked, ~D[2026-09-12])
    comment!(reader, too_late, ~D[2026-09-25])
    comment!(writer, talking_to_myself, ~D[2026-09-14])

    m = month(@september)
    assert m.posts == 4
    assert m.posts_with_footnote == 1
    assert m.posts_with_response == 2
    assert m.people_responding == 1
  end

  test "came back means another post or a footnote for someone else, on a later day, within 30 days" do
    wrote_again = member()
    post!(wrote_again, ~D[2026-09-05])
    post!(wrote_again, ~D[2026-09-20])

    replied = member()
    post!(replied, ~D[2026-09-06])
    other = post!(member(), ~D[2026-08-20])
    comment!(replied, other, ~D[2026-09-10])

    same_day = member()
    post!(same_day, ~D[2026-09-07])
    post!(same_day, ~D[2026-09-07], %{published_at: at(~D[2026-09-07], ~T[15:00:00.000000])})

    too_late = member()
    post!(too_late, ~D[2026-09-08])
    post!(too_late, ~D[2026-10-20])

    m = month(@september)
    assert m.first_time_writers == 4
    assert m.came_back == 2
  end

  test "came back stays unknown until the month's 30 days are over" do
    post!(member(), ~D[2026-10-05])

    m = month(@october)
    assert m.first_time_writers == 1
    assert m.came_back == nil
    assert m.came_back_final_on == ~D[2026-12-01]
  end

  test "spam, admins, private and backdated posts aren't counted" do
    now = DateTime.utc_now()
    reader = member()

    post!(member(blocked_at: now), ~D[2026-09-10])
    post!(member(moderation_state: "limited"), ~D[2026-09-10])
    admin = member(role: "admin")
    post!(admin, ~D[2026-09-10])
    post!(member(), ~D[2026-09-10], %{privacy: :private})

    backdated = member()
    post!(backdated, ~D[2026-03-01])

    real = post!(member(), ~D[2026-09-12])
    comment!(reader, real, ~D[2026-09-13])
    comment!(admin, real, ~D[2026-09-13])

    m = month(@september)
    assert m.writers == 1
    assert m.posts == 1
    assert m.people_responding == 1
  end

  test "a post answered only by an admin still counts as answered" do
    admin = member(role: "admin")
    post = post!(member(), ~D[2026-09-12])
    comment!(admin, post, ~D[2026-09-13])

    m = month(@september)
    assert m.posts_with_footnote == 1
    assert m.people_responding == 0
  end
end
