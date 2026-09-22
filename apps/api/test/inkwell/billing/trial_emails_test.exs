defmodule Inkwell.Billing.TrialEmailsTest do
  @moduledoc """
  Trial members get one reminder about two days before the end and one note
  when it ends. Nothing before 2026-09-22 told them either was happening.
  """
  use Inkwell.DataCase, async: false

  import Inkwell.Factory
  alias Inkwell.{Billing.Trials, Repo}
  alias Inkwell.Accounts.User

  defp trialing(ends_in_hours, attrs \\ %{}) do
    create_user(attrs)
    |> User.subscription_changeset(%{
      subscription_tier: "plus",
      subscription_status: "trialing",
      subscription_expires_at: DateTime.add(DateTime.utc_now(), ends_in_hours, :hour),
      plus_trial_started_at: DateTime.utc_now()
    })
    |> Repo.update!()
  end

  defp reminded?(user), do: Map.has_key?(Repo.get!(User, user.id).settings || %{}, "plus_trial_reminder_sent_at")

  describe "send_due_reminders/1" do
    test "reminds trials ending within two days, once" do
      soon = trialing(30)
      assert Trials.send_due_reminders() == 1
      assert reminded?(soon)
      # The next hourly run doesn't send it again.
      assert Trials.send_due_reminders() == 0
    end

    test "leaves trials with more than two days to go alone" do
      later = trialing(24 * 5)
      assert Trials.send_due_reminders() == 0
      refute reminded?(later)
    end

    test "does not email people who turned email off, but still marks them" do
      user = trialing(10)
      user |> Ecto.Changeset.change(settings: %{"email_notifications_disabled" => true}) |> Repo.update!()
      assert Trials.send_due_reminders() == 0
      assert reminded?(user)
    end

    test "fediverse sign-ins with placeholder addresses are not emailable" do
      user = trialing(10, %{email: "someone@mastodon.example.fediverse.inkwell.social"})
      refute Trials.emailable?(user)
    end
  end

  describe "email_content/3" do
    test "the reminder names the end day, the billing link and a custom domain" do
      user = trialing(30, %{display_name: "Ada Lovelace"})
      {subject, body} = Trials.email_content("reminder", user, "ada.example")

      assert subject =~ "Your Inkwell Plus trial ends"
      assert body =~ "Hey Ada!"
      assert body =~ "/settings/billing"
      assert body =~ "ada.example will stop showing your journal"
      refute body =~ "—"
    end

    test "the ended note works without a domain" do
      user = trialing(-1)
      {subject, body} = Trials.email_content("ended", user, nil)
      assert subject == "Your Inkwell Plus trial has ended"
      assert body =~ "back on the free plan"
      refute body =~ "paused for now"
    end
  end

  test "expire_due still ends trials (and queues the ended note without failing)" do
    user = trialing(-1)
    assert Trials.expire_due() == 1
    assert Repo.get!(User, user.id).subscription_tier == "free"
  end
end
