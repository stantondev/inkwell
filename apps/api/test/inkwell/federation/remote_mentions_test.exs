defmodule Inkwell.Federation.RemoteMentionsTest do
  @moduledoc """
  @user@server mentions of fediverse accounts (Jon Henshaw's roadmap post):
  linked on Inkwell as "@user" to their own profile, sent as Mention tags so
  their server notifies them, and delivered to their inbox.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Federation.{ActivityBuilder, RemoteMentions}
  alias InkwellWeb.Helpers.MentionHelper
  alias Inkwell.Repo

  setup do
    actor =
      create_remote_actor(
        username: "recollect",
        domain: "coywolf.social",
        ap_id: "https://coywolf.social/users/recollect",
        inbox: "https://coywolf.social/users/recollect/inbox",
        shared_inbox: "https://coywolf.social/inbox",
        raw_data: %{"url" => "https://coywolf.social/@recollect"}
      )

    %{actor: actor}
  end

  test "a known account's handle becomes a short mention link", %{actor: actor} do
    {html, actors} = RemoteMentions.link("<p>Thanks @recollect@coywolf.social!</p>")

    assert [%{id: id}] = actors
    assert id == actor.id
    assert html =~ ~s(<span class="h-card"><a href="https://coywolf.social/@recollect" class="u-url mention")
    assert html =~ ~s(title="@recollect@coywolf.social">@<span>recollect</span></a></span>!)
  end

  test "linking twice changes nothing" do
    {once, _} = RemoteMentions.link("<p>Hi @Recollect@Coywolf.social</p>")
    assert {^once, _} = RemoteMentions.link(once)
  end

  test "emails, URLs and existing links are left alone" do
    html =
      ~s(<p>mail me@coywolf.social, see https://coywolf.social/@recollect@coywolf.social ) <>
        ~s(or <a href="https://x.example">@recollect@coywolf.social</a></p>)

    assert {^html, []} = RemoteMentions.link(html)
  end

  test "an account that can't be found stays as typed" do
    html = "<p>Hello @nobody@no-such-server.invalid</p>"
    assert {^html, []} = RemoteMentions.link(html)
  end

  test "a handle on our own server becomes a member mention" do
    member = create_user()
    {html, []} = RemoteMentions.link("<p>Hi @#{member.username}@inkwell.social</p>")
    {linked, [user]} = MentionHelper.process_mentions(html)

    assert user.id == member.id
    assert linked =~ ~s(data-mention="#{member.username}">@#{member.username}</a>)
  end

  test "a member who shares the name isn't linked by a fediverse handle" do
    create_user(username: "recollect")
    assert {_, []} = MentionHelper.process_mentions("<p>@recollect@elsewhere.example</p>")
    assert {_, []} = MentionHelper.process_mentions("<p>write to jo@recollect.example</p>")
  end

  test "publishing links the mention, tags it and addresses it", %{conn: conn, actor: actor} do
    author = create_user()

    data =
      conn
      |> log_in_user(author)
      |> post("/api/entries", %{
        title: "Notes",
        body_html: "<p>Built with @recollect@coywolf.social</p>",
        privacy: "public"
      })
      |> json_response(201)
      |> Map.fetch!("data")

    entry = Repo.get!(Inkwell.Journals.Entry, data["id"])
    assert entry.body_html =~ "@<span>recollect</span>"
    assert entry.body_html =~ ~s(class="h-card")

    article = ActivityBuilder.build_article(entry, author)

    assert %{"type" => "Mention", "href" => "https://coywolf.social/users/recollect", "name" => "@recollect@coywolf.social"} in article["tag"]
    assert actor.ap_id in article["cc"]
    assert [%{id: id}] = RemoteMentions.mentioned_actors(entry.body_html)
    assert id == actor.id
  end

  test "drafts aren't looked up or rewritten", %{conn: conn} do
    data =
      conn
      |> log_in_user(create_user())
      |> post("/api/entries", %{title: "D", body_html: "<p>@recollect@coywolf.social</p>", status: "draft"})
      |> json_response(201)
      |> Map.fetch!("data")

    assert Repo.get!(Inkwell.Journals.Entry, data["id"]).body_html == "<p>@recollect@coywolf.social</p>"
  end
end
