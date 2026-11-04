defmodule InkwellWeb.EntryPageStyleTest do
  @moduledoc """
  A writer's entry-page style (first letter, ink, paper, ending): saved in
  settings, cleaned, and returned with their entries. Illuminated shows only
  while the writer has Plus.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.EntryPage
  alias Inkwell.Repo

  defp plus(user),
    do: user |> Ecto.Changeset.change(subscription_tier: "plus", subscription_status: "active") |> Repo.update!()

  defp save_style(user, page) do
    build_conn() |> log_in_user(user) |> patch("/api/me", %{settings: %{entry_page: page}}) |> json_response(200)
  end

  defp publish(user) do
    build_conn()
    |> log_in_user(user)
    |> post("/api/entries", %{title: "Hello", body_html: "<p>Once upon a time</p>", privacy: "public"})
    |> json_response(201)
    |> Map.fetch!("data")
  end

  defp entry_page_seen_by_reader(user, entry) do
    build_conn()
    |> get("/api/users/#{user.username}/entries/#{entry["slug"]}")
    |> json_response(200)
    |> get_in(["data", "entry_page"])
  end

  test "a writer's choices come back with their entries" do
    user = create_user()
    save_style(user, %{
      initial: "blackletter",
      ink: "red",
      paper: "parchment",
      ending: "fleuron",
      signature: false,
      illumination: "stars",
      text_ink: "sepia"
    })

    page = entry_page_seen_by_reader(user, publish(user))

    assert page == %{
             "initial" => "blackletter",
             "ink" => "red",
             "paper" => "parchment",
             "ending" => "fleuron",
             "signature" => false,
             "illumination" => "stars",
             "text_ink" => "page"
           }
  end

  test "unknown values are dropped and the defaults fill in" do
    user = create_user()
    save_style(user, %{initial: "<script>", ink: "neon", paper: "kraft", ending: 5, signature: "yes", illumination: "lasers", text_ink: "#ff0", extra: "x"})

    stored = Repo.reload!(user).settings["entry_page"]
    assert stored == %{"paper" => "kraft"}

    assert entry_page_seen_by_reader(user, publish(user)) ==
             Map.put(EntryPage.defaults(), "paper", "kraft")
  end

  test "Illuminated shows only while the writer has Plus" do
    user = create_user()
    save_style(user, %{initial: "illuminated", ink: "gold"})
    entry = publish(user)

    assert %{"initial" => "classic", "ink" => "gold"} = entry_page_seen_by_reader(user, entry)

    plus(user)
    assert %{"initial" => "illuminated"} = entry_page_seen_by_reader(user, entry)
  end

  test "writing ink shows only while the writer has Plus" do
    user = create_user()
    save_style(user, %{text_ink: "oxblood"})
    entry = publish(user)

    assert Repo.reload!(user).settings["entry_page"]["text_ink"] == "oxblood"
    assert %{"text_ink" => "page"} = entry_page_seen_by_reader(user, entry)

    plus(user)
    assert %{"text_ink" => "oxblood"} = entry_page_seen_by_reader(user, entry)
  end

  test "writers who never chose get the defaults" do
    user = create_user()
    assert entry_page_seen_by_reader(user, publish(user)) == EntryPage.defaults()
  end
end
