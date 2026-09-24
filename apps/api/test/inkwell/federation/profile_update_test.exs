defmodule Inkwell.Federation.ProfileUpdateTest do
  @moduledoc """
  Profile changes reach the fediverse: the avatar/banner URL changes when the
  image does (Mastodon only re-downloads on a new URL), and followers' servers
  get an Update{Person} when something they show changes.
  """
  use Inkwell.DataCase, async: false
  use Oban.Testing, repo: Inkwell.Repo

  alias Inkwell.Accounts
  alias Inkwell.Federation.ActivityBuilder
  alias Inkwell.Federation.Workers.{DeliverActivityWorker, FanOutWorker}

  @png1 "data:image/png;base64," <> Base.encode64(<<0x89, "PNG", 1>>)
  @png2 "data:image/png;base64," <> Base.encode64(<<0x89, "PNG", 2>>)

  # The factory's registration changeset ignores profile fields.
  defp user_with(attrs), do: create_user() |> Ecto.Changeset.change(attrs) |> Repo.update!()

  defp icon_url(user), do: ActivityBuilder.build_person(user)["icon"]["url"]

  describe "avatar and banner URLs" do
    test "change exactly when the image changes" do
      user = user_with(avatar_url: @png1, profile_banner_url: @png1)
      url = icon_url(user)

      assert url =~ ~r"^https://inkwell\.test/api/avatars/#{user.username}\?v=[\w-]{12}$"
      assert icon_url(%{user | bio: "new bio"}) == url
      refute icon_url(%{user | avatar_url: @png2}) == url

      banner = ActivityBuilder.build_person(user)["image"]["url"]
      assert banner =~ ~r"/api/banners/#{user.username}\?v="
    end
  end

  describe "profile links" do
    test "full URLs aren't prefixed again; bare handles still are" do
      user =
        user_with(
          social_links: %{"github" => "https://github.com/stantondev", "twitter" => "@someone"}
        )

      values =
        ActivityBuilder.build_person(user)["attachment"]
        |> Map.new(&{&1["name"], &1["value"]})

      assert values["GitHub"] =~ ~s(href="https://github.com/stantondev")
      refute values["GitHub"] =~ "github.com/https"
      assert values["X/Twitter"] =~ ~s(href="https://x.com/someone")
    end
  end

  describe "build_update_person/1" do
    test "wraps the actor in an Update from the actor" do
      user = user_with(avatar_url: @png1)
      activity = ActivityBuilder.build_update_person(user)
      actor = "https://inkwell.test/users/#{user.username}"

      assert activity["type"] == "Update"
      assert activity["actor"] == actor
      assert activity["object"]["id"] == actor
      assert activity["object"]["type"] == "Person"
      refute Map.has_key?(activity["object"], "@context")
      assert "https://www.w3.org/ns/activitystreams" in activity["@context"]
      assert activity["object"]["icon"]["url"] == icon_url(user)
    end
  end

  describe "update_user_profile/2" do
    setup do
      user = user_with(avatar_url: @png1)
      actor = create_remote_actor()
      create_relationship(remote_actor_id: actor.id, following_id: user.id, status: :accepted)
      %{user: user}
    end

    test "queues a profile update when the avatar changes", %{user: user} do
      Oban.Testing.with_testing_mode(:manual, fn ->
        {:ok, _} = Accounts.update_user_profile(user, %{"avatar_url" => @png2})
        assert_enqueued(worker: FanOutWorker, args: %{action: "update_profile", user_id: user.id})
      end)
    end

    test "several saves in a row queue one update", %{user: user} do
      Oban.Testing.with_testing_mode(:manual, fn ->
        {:ok, user} = Accounts.update_user_profile(user, %{"display_name" => "A"})
        {:ok, _} = Accounts.update_user_profile(user, %{"bio" => "B"})
        assert length(all_enqueued(worker: FanOutWorker)) == 1
      end)
    end

    test "nothing is sent for changes the fediverse doesn't show", %{user: user} do
      Oban.Testing.with_testing_mode(:manual, fn ->
        {:ok, user} = Accounts.update_user_profile(user, %{"profile_theme" => "midnight"})
        # Saving the same avatar again changes nothing either.
        {:ok, _} = Accounts.update_user_profile(user, %{"avatar_url" => @png1})
        refute_enqueued(worker: FanOutWorker)
      end)
    end

    test "the job delivers the Update to followers' inboxes", %{user: user} do
      Oban.Testing.with_testing_mode(:manual, fn ->
        :ok = perform_job(FanOutWorker, %{action: "update_profile", user_id: user.id})
        [job] = all_enqueued(worker: DeliverActivityWorker)
        assert job.args["activity"]["type"] == "Update"
        assert job.args["activity"]["object"]["type"] == "Person"
      end)
    end

    test "suspended accounts send nothing", %{user: user} do
      user |> Ecto.Changeset.change(blocked_at: DateTime.utc_now()) |> Repo.update!()

      Oban.Testing.with_testing_mode(:manual, fn ->
        :ok = perform_job(FanOutWorker, %{action: "update_profile", user_id: user.id})
        refute_enqueued(worker: DeliverActivityWorker)
      end)
    end
  end
end
