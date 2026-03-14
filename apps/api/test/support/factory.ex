defmodule Inkwell.Factory do
  @moduledoc """
  Test data factory for creating users, remote actors, and relationships.
  """

  alias Inkwell.Repo
  alias Inkwell.Accounts.User
  alias Inkwell.Federation.RemoteActorSchema
  alias Inkwell.Social.Relationship

  @doc "Creates a local user with valid RSA keys and AP ID."
  def create_user(attrs \\ %{}) do
    unique = System.unique_integer([:positive])

    defaults = %{
      username: "testuser_#{unique}",
      email: "test_#{unique}@example.com",
      display_name: "Test User #{unique}"
    }

    merged = Map.merge(defaults, Map.new(attrs))

    %User{}
    |> User.registration_changeset(merged)
    |> Repo.insert!()
  end

  @doc "Creates a remote (fediverse) actor."
  def create_remote_actor(attrs \\ %{}) do
    unique = System.unique_integer([:positive])

    defaults = %{
      ap_id: "https://mastodon.example/users/remote_#{unique}",
      username: "remote_#{unique}",
      domain: "mastodon.example",
      display_name: "Remote User #{unique}",
      inbox: "https://mastodon.example/users/remote_#{unique}/inbox",
      shared_inbox: "https://mastodon.example/inbox",
      public_key_pem: generate_test_public_key()
    }

    merged = Map.merge(defaults, Map.new(attrs))

    %RemoteActorSchema{}
    |> RemoteActorSchema.changeset(merged)
    |> Repo.insert!()
  end

  @doc "Creates a relationship between users or with a remote actor."
  def create_relationship(attrs) do
    %Relationship{}
    |> Relationship.changeset(Map.new(attrs))
    |> Repo.insert!()
  end

  defp generate_test_public_key do
    # A minimal valid PEM public key for testing
    key = :public_key.generate_key({:rsa, 2048, 65537})
    public_key = {:RSAPublicKey, elem(key, 2), elem(key, 3)}
    :public_key.pem_encode([:public_key.pem_entry_encode(:SubjectPublicKeyInfo, public_key)])
  end
end
