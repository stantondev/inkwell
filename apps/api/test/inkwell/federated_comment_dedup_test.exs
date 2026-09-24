defmodule Inkwell.FederatedCommentDedupTest do
  @moduledoc """
  One comment per fediverse post. A reply mentioning two members arrives
  twice at once (shared inbox + a member's inbox); on 2026-09-24 both copies
  of a reply from @jon@henshaw.social were saved, because both deliveries
  checked for an existing comment before either had written one.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Journals
  alias Inkwell.Journals.Comment

  setup do
    author = create_user()

    {:ok, entry} =
      Journals.create_entry(%{
        "user_id" => author.id,
        "title" => "A public entry",
        "body_html" => "<p>hi</p>",
        "privacy" => "public"
      })

    %{entry: entry}
  end

  defp remote_attrs(entry, ap_id) do
    %{
      "entry_id" => entry.id,
      "body_html" => "<p>I really love this</p>",
      "ap_id" => ap_id,
      "remote_author" => %{"username" => "jon", "domain" => "henshaw.social"}
    }
  end

  test "the database refuses a second copy of the same fediverse post", %{entry: entry} do
    ap_id = "https://henshaw.social/users/jon/statuses/1"
    assert {:ok, _} = Journals.create_comment(remote_attrs(entry, ap_id))
    assert {:error, changeset} = Journals.create_comment(remote_attrs(entry, ap_id))
    assert {_, opts} = changeset.errors[:ap_id]
    assert opts[:constraint_name] == "comments_remote_ap_id_index"
    assert Repo.aggregate(Comment, :count) == 1
  end

  test "comments written here may share their throwaway ap_id", %{entry: entry} do
    user = create_user()

    for _ <- 1..2 do
      assert {:ok, _} =
               Journals.create_comment(%{
                 "entry_id" => entry.id,
                 "user_id" => user.id,
                 "body_html" => "<p>local</p>",
                 "ap_id" => "https://inkwell.social/comments/9458"
               })
    end
  end

  test "a reply delivered twice is one comment", %{entry: entry} do
    actor = create_remote_actor()

    note = %{
      "type" => "Note",
      "id" => "#{actor.ap_id}/statuses/42",
      "attributedTo" => actor.ap_id,
      "inReplyTo" => entry.ap_id,
      "to" => ["https://www.w3.org/ns/activitystreams#Public"],
      "cc" => [],
      "content" => "<p>Nice</p>"
    }

    activity = %{"type" => "Create", "actor" => actor.ap_id, "object" => note}
    InkwellWeb.FederationController.process_activity_async(activity, nil)
    InkwellWeb.FederationController.process_activity_async(activity, nil)

    assert Repo.aggregate(Comment, :count) == 1
  end
end
