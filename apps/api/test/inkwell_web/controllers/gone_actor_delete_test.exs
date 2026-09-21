defmodule InkwellWeb.GoneActorDeleteTest do
  @moduledoc """
  Deletes from accounts that no longer exist.

  Their signature can never be verified — the key is gone with the account — so
  refusing them only makes the sender redeliver for days. They are accepted and
  dropped, and the only action ever taken on one is purging the very account its
  own server has confirmed gone.
  """
  use ExUnit.Case, async: true

  alias InkwellWeb.FederationController, as: FC

  @gone {:http_error, 410}
  @alice "https://mastodon.social/users/alice"

  describe "which activities are accepted unverified" do
    test "a Delete whose actor's server reports it gone" do
      assert FC.delete_from_gone_actor?(%{"type" => "Delete"}, @gone)
      assert FC.delete_from_gone_actor?(%{"type" => "Delete"}, {:http_error, 404})
    end

    test "nothing else — a Create is still refused" do
      refute FC.delete_from_gone_actor?(%{"type" => "Create"}, @gone)
      refute FC.delete_from_gone_actor?(%{"type" => "Announce"}, @gone)
    end

    test "not a Delete that failed verification for some other reason" do
      refute FC.delete_from_gone_actor?(%{"type" => "Delete"}, :invalid_signature)
      refute FC.delete_from_gone_actor?(%{"type" => "Delete"}, {:http_error, 500})
      refute FC.delete_from_gone_actor?(%{"type" => "Delete"}, {:http_error, 403})
    end
  end

  describe "what an unverified Delete may purge" do
    test "an account deleting itself, signed by its own key" do
      params = %{"type" => "Delete", "actor" => @alice, "object" => @alice}

      assert FC.self_delete_target(params, @alice) == @alice
    end

    test "the same, with the object given as an object rather than a URI" do
      params = %{"type" => "Delete", "actor" => @alice, "object" => %{"id" => @alice}}

      assert FC.self_delete_target(params, @alice) == @alice
    end

    test "nothing, when the Delete names somebody other than its actor" do
      victim = "https://mastodon.social/users/victim"
      params = %{"type" => "Delete", "actor" => @alice, "object" => victim}

      assert FC.self_delete_target(params, @alice) == nil
    end

    test "nothing, when the signing key belongs to a different account" do
      # The gone account we probed is not the account being deleted, so its 410
      # says nothing about whether this Delete is genuine.
      params = %{"type" => "Delete", "actor" => @alice, "object" => @alice}

      assert FC.self_delete_target(params, "https://evil.example/users/mallory") == nil
    end

    test "nothing, when the key could not be resolved to an actor" do
      params = %{"type" => "Delete", "actor" => @alice, "object" => @alice}

      assert FC.self_delete_target(params, nil) == nil
    end

    test "nothing, when the activity carries no actor" do
      assert FC.self_delete_target(%{"type" => "Delete", "object" => @alice}, nil) == nil
      assert FC.self_delete_target(%{"type" => "Delete", "actor" => "", "object" => ""}, "") == nil
    end
  end
end
