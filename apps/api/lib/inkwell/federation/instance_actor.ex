defmodule Inkwell.Federation.InstanceActor do
  @moduledoc """
  Manages the instance-level relay actor used for subscribing to AP relays.
  Uses a real user row with reserved username "relay" so existing signing
  and delivery infrastructure (DeliverActivityWorker) works unchanged.
  Created lazily on first relay subscription.
  """

  alias Inkwell.Repo
  alias Inkwell.Accounts.User

  require Logger

  @relay_username "relay"

  @doc """
  Returns the relay user, creating it if it doesn't exist.
  """
  def get_or_create do
    case Repo.get_by(User, username: @relay_username) do
      nil -> create_relay_user()
      user -> {:ok, user}
    end
  end

  defp create_relay_user do
    {public_pem, private_pem} = generate_rsa_keypair()

    now = DateTime.utc_now() |> DateTime.truncate(:microsecond)

    attrs = %{
      id: Ecto.UUID.generate(),
      username: @relay_username,
      email: "relay@localhost",
      display_name: "Inkwell Relay",
      bio: "Instance relay actor for fediverse relay subscriptions.",
      ap_id: "https://inkwell.social/users/#{@relay_username}",
      public_key: public_pem,
      private_key: private_pem,
      role: "user",
      settings: %{"system_actor" => true},
      inserted_at: now,
      updated_at: now
    }

    case %User{}
         |> Ecto.Changeset.cast(attrs, [
           :id, :username, :email, :display_name, :bio, :ap_id,
           :public_key, :private_key, :role, :settings,
           :inserted_at, :updated_at
         ])
         |> Repo.insert() do
      {:ok, user} ->
        Logger.info("Created instance relay actor: #{@relay_username}")
        {:ok, user}

      {:error, changeset} ->
        # Race condition: another process created it
        case Repo.get_by(User, username: @relay_username) do
          nil -> {:error, changeset}
          user -> {:ok, user}
        end
    end
  end

  # Same key generation as User.generate_rsa_keypair/0 (which is private)
  defp generate_rsa_keypair do
    key = :public_key.generate_key({:rsa, 2048, 65537})
    private_pem = :public_key.pem_encode([:public_key.pem_entry_encode(:RSAPrivateKey, key)])
    public_key = {:RSAPublicKey, elem(key, 2), elem(key, 3)}
    public_pem = :public_key.pem_encode([:public_key.pem_entry_encode(:SubjectPublicKeyInfo, public_key)])
    {public_pem, private_pem}
  end
end
