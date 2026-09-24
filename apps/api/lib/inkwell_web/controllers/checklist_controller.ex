defmodule InkwellWeb.ChecklistController do
  @moduledoc """
  The "Getting started" checklist on Feed for new members. Half the people who
  sign up never publish, and new writers who never respond to anyone else look
  like spam to auto-moderation, so the steps point at exactly those things.
  """

  use InkwellWeb, :controller

  import Ecto.Query

  alias Inkwell.Repo

  # GET /api/me/checklist
  def show(conn, _params) do
    user = conn.assigns.current_user
    id = user.id

    published =
      Repo.exists?(from(e in Inkwell.Journals.Entry, where: e.user_id == ^id and e.status == :published))

    following =
      Repo.one(
        from(r in Inkwell.Social.Relationship,
          where: r.follower_id == ^id and r.status in [:accepted, :pending],
          select: count(r.id)
        )
      )

    responded =
      Repo.exists?(
        from(c in Inkwell.Journals.Comment,
          join: e in assoc(c, :entry),
          where: c.user_id == ^id and e.user_id != ^id
        )
      ) or
        Repo.exists?(from(i in Inkwell.Inks.Ink, where: i.user_id == ^id)) or
        Repo.exists?(from(s in Inkwell.Stamps.Stamp, where: s.user_id == ^id))

    signed_guestbook =
      Repo.exists?(
        from(g in Inkwell.Guestbook.GuestbookEntry, where: g.author_id == ^id and g.profile_user_id != ^id)
      )

    json(conn, %{
      data: %{
        profile: not blank?(user.avatar_url) and not blank?(user.bio_html || user.bio),
        published: published,
        following: following,
        responded: responded,
        signed_guestbook: signed_guestbook
      }
    })
  end

  defp blank?(nil), do: true
  defp blank?(s) when is_binary(s), do: String.trim(s) == ""
  defp blank?(_), do: false
end
