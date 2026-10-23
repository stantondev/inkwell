defmodule Inkwell.Federation.RemoteActorPruneTest do
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.Repo
  alias Inkwell.Federation.{RemoteActor, RemoteActorSchema}
  alias Inkwell.Guestbook.GuestbookEntry

  defp age(actor, days) do
    old = DateTime.add(DateTime.utc_now(), -days * 86_400, :second)
    Repo.update_all(from(a in RemoteActorSchema, where: a.id == ^actor.id), set: [updated_at: old])
    actor
  end

  defp present?(actor), do: Repo.get(RemoteActorSchema, actor.id) != nil

  test "drops old cached actors nothing refers to and keeps the rest" do
    user = create_user()

    unused = create_remote_actor() |> age(60)
    recent = create_remote_actor() |> age(5)
    follower = create_remote_actor() |> age(60)
    create_relationship(%{follower_id: nil, following_id: user.id, remote_actor_id: follower.id, status: :accepted})

    signer = create_remote_actor() |> age(60)

    %GuestbookEntry{}
    |> GuestbookEntry.ap_changeset(%{
      body: "Hello",
      profile_user_id: user.id,
      ap_id: "#{signer.ap_id}/statuses/1",
      remote_author: %{"ap_id" => signer.ap_id, "username" => signer.username, "domain" => "mastodon.example"}
    })
    |> Repo.insert!()

    assert RemoteActor.prune_unused(30, 1) == 1

    refute present?(unused)
    assert present?(recent)
    assert present?(follower)
    assert present?(signer)
  end

  test "works through more rows than one batch" do
    for _ <- 1..5, do: create_remote_actor() |> age(60)
    assert RemoteActor.prune_unused(30, 2) == 5
  end
end
