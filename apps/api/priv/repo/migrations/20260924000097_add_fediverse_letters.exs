defmodule Inkwell.Repo.Migrations.AddFediverseLetters do
  use Ecto.Migration

  # Letters with fediverse accounts (private mentions both ways).
  #
  # A conversation with a fediverse account has the member as participant_a,
  # no participant_b, and the account in remote_actor_id. Letters it sends
  # have no sender_id and carry sender_remote_actor_id, plus the ActivityPub
  # id of the Note they arrived as (ap_id), so a redelivery can't add a letter
  # twice and an Update or Delete can find it. Letters we send there get
  # ap_id too, so a reply's inReplyTo can be matched.
  #
  # The check constraints keep every existing row valid (all have
  # participant_b and sender_id) and make a half-remote row impossible.
  def change do
    alter table(:conversations) do
      modify(:participant_b, :binary_id, null: true, from: {:binary_id, null: false})
      add(:remote_actor_id, references(:remote_actors, type: :binary_id, on_delete: :delete_all))
      # The other server's conversation/context id, echoed on replies so they
      # thread on that side.
      add(:ap_context, :text)
    end

    create(
      unique_index(:conversations, [:participant_a, :remote_actor_id],
        where: "remote_actor_id IS NOT NULL",
        name: :conversations_participant_a_remote_actor_id_index
      )
    )

    create(
      constraint(:conversations, :one_other_participant,
        check: "(participant_b IS NULL) <> (remote_actor_id IS NULL)"
      )
    )

    alter table(:direct_messages) do
      modify(:sender_id, :binary_id, null: true, from: {:binary_id, null: false})

      add(
        :sender_remote_actor_id,
        references(:remote_actors, type: :binary_id, on_delete: :delete_all)
      )

      add(:ap_id, :text)
    end

    create(unique_index(:direct_messages, [:ap_id], where: "ap_id IS NOT NULL"))

    create(
      constraint(:direct_messages, :one_sender,
        check: "(sender_id IS NULL) <> (sender_remote_actor_id IS NULL)"
      )
    )
  end
end
