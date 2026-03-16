defmodule Inkwell.Auth.LoginHandoff do
  @moduledoc """
  ETS-based ephemeral store for PWA login handoffs.

  When a magic link is requested, a handoff ID is created. When the browser
  verifies the magic link, it completes the handoff by storing the session token.
  The PWA polls the claim endpoint using the handoff ID to retrieve the token
  without needing the browser's cookie.

  Entries expire after 5 minutes and are lazily cleaned up.
  """

  use GenServer

  @table :login_handoffs
  @ttl_ms 5 * 60 * 1000

  # ── Public API ──────────────────────────────────────────────────────────────

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "Create a new handoff and return its ID."
  def create_handoff do
    id =
      :crypto.strong_rand_bytes(16)
      |> Base.url_encode64(padding: false)

    expiry = System.system_time(:millisecond) + @ttl_ms
    :ets.insert(@table, {id, nil, nil, expiry})
    lazy_cleanup()
    id
  end

  @doc "Complete a handoff after magic link verification."
  def complete_handoff(nil, _token, _user_data), do: :ok

  def complete_handoff(id, token, user_data) do
    case :ets.lookup(@table, id) do
      [{^id, _old_token, _old_user, expiry}] ->
        if System.system_time(:millisecond) < expiry do
          :ets.insert(@table, {id, token, user_data, expiry})
          :ok
        else
          :ets.delete(@table, id)
          :expired
        end

      [] ->
        :not_found
    end
  end

  @doc "Claim a completed handoff. Returns {:ok, token, user_data}, :pending, or :not_found."
  def claim_handoff(id) do
    now = System.system_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, nil, nil, expiry}] when expiry > now ->
        :pending

      [{^id, token, user_data, expiry}] when expiry > now and not is_nil(token) ->
        :ets.delete(@table, id)
        {:ok, token, user_data}

      [{^id, _token, _user, _expiry}] ->
        # Expired
        :ets.delete(@table, id)
        :not_found

      [] ->
        :not_found
    end
  end

  # ── GenServer callbacks ─────────────────────────────────────────────────────

  @impl true
  def init([]) do
    :ets.new(@table, [:set, :public, :named_table])
    {:ok, %{}}
  end

  # ── Private ─────────────────────────────────────────────────────────────────

  defp lazy_cleanup do
    now = System.system_time(:millisecond)

    :ets.select_delete(@table, [
      {{:"$1", :"$2", :"$3", :"$4"}, [{:<, :"$4", now}], [true]}
    ])
  end
end
