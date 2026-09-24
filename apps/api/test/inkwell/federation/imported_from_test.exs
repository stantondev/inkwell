defmodule Inkwell.Federation.ImportedFromTest do
  @moduledoc """
  FEP-0c7f (draft): imported entries carry `importedFrom`, and an incoming post
  that carries it doesn't notify the people it mentions.
  """
  use InkwellWeb.ConnCase, async: false

  import Ecto.Query

  alias Inkwell.Accounts.Notification
  alias Inkwell.Federation.ActivityBuilder
  alias Inkwell.Journals.Entry
  alias Inkwell.Repo
  alias InkwellWeb.FederationController

  @public "https://www.w3.org/ns/activitystreams#Public"
  @term "https://w3id.org/fep/0c7f#importedFrom"

  defp entry(user, attrs) do
    defaults = %{
      user_id: user.id,
      title: "The last day of school",
      body_html: "<p>hi</p>",
      status: :published,
      privacy: :public,
      slug: "s-#{System.unique_integer([:positive])}",
      published_at: ~U[2004-06-11 21:14:00.000000Z]
    }

    Repo.insert!(struct(Entry, Map.merge(defaults, attrs)))
  end

  defp has_term?(context), do: Enum.any?(List.wrap(context), &match?(%{"importedFrom" => %{"@id" => @term}}, &1))

  test "an entry with its original URL points importedFrom at it" do
    user = create_user()

    e =
      entry(user, %{imported_from: "livejournal", imported_url: "https://alice.livejournal.com/12345.html"})

    create = ActivityBuilder.build_create_note(e, user)

    assert create["object"]["importedFrom"] == %{
             "type" => "Link",
             "href" => "https://alice.livejournal.com/12345.html",
             "name" => "LiveJournal"
           }

    assert create["object"]["published"] == "2004-06-11T21:14:00.000000Z"
    assert has_term?(create["@context"])
    assert has_term?(ActivityBuilder.build_update_note(e, user)["@context"])
  end

  test "without the original URL it points at the platform" do
    user = create_user()
    e = entry(user, %{imported_from: "dreamwidth"})

    assert ActivityBuilder.build_article(e, user)["importedFrom"]["href"] == "https://www.dreamwidth.org/"
  end

  test "a WordPress post without its URL has no honest href, so no importedFrom" do
    user = create_user()
    e = entry(user, %{imported_from: "wordpress"})

    refute Map.has_key?(ActivityBuilder.build_article(e, user), "importedFrom")
    refute has_term?(ActivityBuilder.build_create_note(e, user)["@context"])
  end

  test "entries written on Inkwell are unchanged" do
    user = create_user()
    e = entry(user, %{published_at: DateTime.utc_now()})

    create = ActivityBuilder.build_create_note(e, user)
    refute Map.has_key?(create["object"], "importedFrom")
    assert create["@context"] == ["https://www.w3.org/ns/activitystreams", "https://w3id.org/security/v1"]
  end

  test "fetching an imported entry returns importedFrom with its context", %{conn: conn} do
    user = create_user()
    e = entry(user, %{imported_from: "medium", imported_url: "https://medium.com/@alice/old-post-1a2b"})

    body =
      conn
      |> put_req_header("accept", "application/activity+json")
      |> get("/entries/#{e.id}")
      |> json_response(200)

    assert body["importedFrom"]["href"] == "https://medium.com/@alice/old-post-1a2b"
    assert has_term?(body["@context"])
  end

  describe "receiving" do
    defp public_note(actor, member, extra) do
      Map.merge(
        %{
          "type" => "Note",
          "id" => "#{actor.ap_id}/statuses/#{System.unique_integer([:positive])}",
          "attributedTo" => actor.ap_id,
          "content" => "<p>remember this, @#{member.username}?</p>",
          "published" => "2009-05-01T12:00:00Z",
          "to" => [@public],
          "tag" => [%{"type" => "Mention", "href" => "#{InkwellWeb.Endpoint.url()}/users/#{member.username}"}]
        },
        extra
      )
    end

    defp mentions(member),
      do: Repo.all(from n in Notification, where: n.user_id == ^member.id and n.type == :fediverse_mention)

    test "a mention in an imported post doesn't notify" do
      member = create_user()
      actor = create_remote_actor()

      note =
        public_note(actor, member, %{
          "importedFrom" => %{"type" => "Link", "href" => "https://oldblog.example/", "name" => "Old Blog"}
        })

      FederationController.process_activity_async(%{"type" => "Create", "actor" => actor.ap_id, "object" => note}, member)
      assert mentions(member) == []
    end

    test "the same mention in an ordinary post still does" do
      member = create_user()
      actor = create_remote_actor()
      note = public_note(actor, member, %{})

      FederationController.process_activity_async(%{"type" => "Create", "actor" => actor.ap_id, "object" => note}, member)
      assert [_] = mentions(member)
    end
  end
end
