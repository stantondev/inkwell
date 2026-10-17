defmodule Inkwell.Billing.ThankYouTest do
  use Inkwell.DataCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Billing.{Founding, ThankYou}

  test "the notes thank the member and link the open books" do
    user = create_user()

    for kind <- ~w(plus founding gift) do
      {subject, body} = ThankYou.email_content(kind, user, 500)
      assert subject =~ "Thank"
      assert body =~ "/transparency"
      assert body =~ "reply"
    end

    {_, gift} = ThankYou.email_content("gift", user, 500)
    assert gift =~ "$5"
  end

  test "a founding grant sends one note, even when granted twice" do
    Oban.Testing.with_testing_mode(:manual, fn ->
      user = create_user()
      {:ok, _, :granted} = Founding.grant(user, "pay_thanks", 9900)
      {:ok, _, :already_granted} = Founding.grant(user, "pay_thanks", 9900)

      assert [_] = all_enqueued(worker: Inkwell.Workers.ThankYouEmailWorker)
    end)
  end

  test "no note for someone who turned email off" do
    Oban.Testing.with_testing_mode(:manual, fn ->
      user =
        create_user()
        |> Ecto.Changeset.change(settings: %{"email_notifications_disabled" => true})
        |> Inkwell.Repo.update!()

      ThankYou.queue(user, "plus", "sub_1")
      refute_enqueued(worker: Inkwell.Workers.ThankYouEmailWorker)
    end)
  end
end
