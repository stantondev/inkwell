defmodule Inkwell.Auth.LoginHandoff do
  @moduledoc """
  ETS-based ephemeral store for cross-context login handoffs.

  Someone asks for a sign-in link in one place (typically the installed app,
  which keeps its own cookies) and opens the email in another (Safari, or an
  email app's built-in browser). The first place polls `claim_handoff/1` and
  receives a session once the second place hands it over.

  Handing over is gated by a 4-digit code that is shown only on the screen
  that asked for the link. Before 2026-09-19 opening the link completed the
  handoff automatically, and the magic-link endpoint returns the handoff ID to
  whoever calls it, for any email address. So anyone could request a link
  for someone else's email, keep the ID, and receive that person's session
  the moment they clicked the unexpected email. Now the person opening the
  link must type the code from the other screen, which an attacker can't make
  them see.

  The same browser never needs this: opening the link there sets its cookie
  directly. Entries expire after 5 minutes; a wrong code 5 times destroys the
  handoff.
  """

  use GenServer

  @table :login_handoffs
  @ttl_ms 5 * 60 * 1000
  @max_attempts 5

  # ── Public API ──────────────────────────────────────────────────────────────

  def start_link(_opts) do
    GenServer.start_link(__MODULE__, [], name: __MODULE__)
  end

  @doc "Create a new handoff. Returns `{id, code}`; the code is only for the requesting screen."
  def create_handoff do
    id =
      :crypto.strong_rand_bytes(16)
      |> Base.url_encode64(padding: false)

    code = generate_code()
    expiry = System.system_time(:millisecond) + @ttl_ms
    :ets.insert(@table, {id, code, 0, nil, nil, expiry})
    lazy_cleanup()
    {id, code}
  end

  @doc """
  Hand a session over to the screen that requested the link, if `code`
  matches the one shown there. Returns :ok, :wrong_code, :expired or :not_found.
  """
  def complete_handoff(id, code, token, user_data)
      when is_binary(id) and is_binary(code) do
    now = System.system_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, _code, _attempts, _token, _user, expiry}] when expiry <= now ->
        :ets.delete(@table, id)
        :expired

      [{^id, stored_code, attempts, _token, _user, expiry}] ->
        if Plug.Crypto.secure_compare(stored_code, String.trim(code)) do
          :ets.insert(@table, {id, stored_code, attempts, token, user_data, expiry})
          :ok
        else
          if attempts + 1 >= @max_attempts do
            :ets.delete(@table, id)
            :expired
          else
            :ets.insert(@table, {id, stored_code, attempts + 1, nil, nil, expiry})
            :wrong_code
          end
        end

      [] ->
        :not_found
    end
  end

  def complete_handoff(_id, _code, _token, _user_data), do: :not_found

  @doc "Claim a completed handoff. Returns {:ok, token, user_data}, :pending, or :not_found."
  def claim_handoff(id) do
    now = System.system_time(:millisecond)

    case :ets.lookup(@table, id) do
      [{^id, _code, _attempts, nil, _user, expiry}] when expiry > now ->
        :pending

      [{^id, _code, _attempts, token, user_data, expiry}] when expiry > now ->
        :ets.delete(@table, id)
        {:ok, token, user_data}

      [{^id, _code, _attempts, _token, _user, _expiry}] ->
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

  defp generate_code do
    :crypto.strong_rand_bytes(4)
    |> :binary.decode_unsigned()
    |> rem(10_000)
    |> Integer.to_string()
    |> String.pad_leading(4, "0")
  end

  defp lazy_cleanup do
    now = System.system_time(:millisecond)

    :ets.select_delete(@table, [
      {{:"$1", :"$2", :"$3", :"$4", :"$5", :"$6"}, [{:<, :"$6", now}], [true]}
    ])
  end
end
