defmodule Inkwell.LetterEmailTest do
  @moduledoc """
  Letter emails: at most one per unread stretch per conversation, and only
  to people who can and want to receive them.

  Oban runs inline in tests and ignores `schedule_in`, so sending a letter
  runs the email job straight away. These tests follow `emailed_at`, which
  the job sets only when it sends.
  """
  use InkwellWeb.ConnCase, async: false

  alias Inkwell.Letters
  alias Inkwell.Letters.ConversationRead

  setup do
    alice = create_user()
    bob = create_user()
    create_relationship(follower_id: alice.id, following_id: bob.id, status: :accepted, is_mutual: true)
    create_relationship(follower_id: bob.id, following_id: alice.id, status: :accepted, is_mutual: true)
    {:ok, conv} = Letters.get_or_create_conversation(alice.id, bob.username)
    %{alice: alice, bob: bob, conv: conv}
  end

  defp write(conv, from, body \\ "hello") do
    {:ok, m} = Letters.send_letter(conv.id, from.id, body)
    m
  end

  defp emailed_at(conv, user) do
    case Repo.get_by(ConversationRead, conversation_id: conv.id, user_id: user.id) do
      nil -> nil
      read -> read.emailed_at
    end
  end

  test "one email per unread stretch", %{alice: alice, bob: bob, conv: conv} do
    write(conv, alice)
    first = emailed_at(conv, bob)
    assert first, "no email for the first unread letter"

    # More letters before Bob reads: still just that one email.
    write(conv, alice, "and another")
    assert emailed_at(conv, bob) == first

    # Bob reads, and the next letter starts a new stretch.
    Process.sleep(2)
    Letters.mark_read(conv.id, bob.id)
    Process.sleep(2)
    write(conv, alice, "later")
    assert DateTime.compare(emailed_at(conv, bob), first) == :gt
  end

  test "recording an email doesn't mark anything read", %{alice: alice, bob: bob, conv: conv} do
    write(conv, alice)
    assert emailed_at(conv, bob)
    assert Letters.count_unread_letters(bob.id) == 1
    assert [{_, _, _, 1, _}] = Letters.list_conversations(bob.id)
  end

  # Letters inserted directly skip `send_letter`, so no job runs until we run it.
  defp arrive(conv, from, body),
    do: Repo.insert!(%Inkwell.Letters.DirectMessage{conversation_id: conv.id, sender_id: from.id, body: body})

  defp run_job(conv, user),
    do: Inkwell.Workers.LetterEmailWorker.perform(%Oban.Job{args: %{"conversation_id" => conv.id, "recipient_id" => user.id}})

  test "nothing if it was read before the email went out", %{alice: alice, bob: bob, conv: conv} do
    arrive(conv, alice, "x")
    Letters.mark_read(conv.id, bob.id)
    assert :ok = run_job(conv, bob)
    refute emailed_at(conv, bob)
  end

  test "the sender isn't emailed about their own letter", %{alice: alice, conv: conv} do
    write(conv, alice)
    refute emailed_at(conv, alice)
  end

  for settings <- [%{"letter_emails_disabled" => true}, %{"email_notifications_disabled" => true}] do
    test "respects #{inspect(settings)}", %{alice: alice, bob: bob, conv: conv} do
      bob |> Ecto.Changeset.change(settings: unquote(Macro.escape(settings))) |> Repo.update!()
      write(conv, alice)
      refute emailed_at(conv, bob)
    end
  end

  test "skips fediverse placeholder addresses", %{alice: alice, bob: bob, conv: conv} do
    bob |> Ecto.Changeset.change(email: "bob@mastodon.example.fediverse.inkwell.social") |> Repo.update!()
    write(conv, alice)
    refute emailed_at(conv, bob)
  end

  test "nothing after a block", %{alice: alice, bob: bob, conv: conv} do
    arrive(conv, alice, "before the block")
    {:ok, _} = Inkwell.Social.block(bob.id, alice.id)
    assert :ok = run_job(conv, bob)
    refute emailed_at(conv, bob)
  end
end
