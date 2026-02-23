defmodule Inkwell.Federation.ActivityDelivery do
  @moduledoc """
  Delivers ActivityPub activities to remote inboxes via HTTP POST
  with HTTP Signature authentication.
  """

  alias Inkwell.Federation.{Http, HttpSignature}

  require Logger

  @doc """
  Delivers an activity JSON to a remote inbox, signed with the user's private key.
  Returns :ok on success or {:error, reason} on failure.
  """
  def deliver(activity, inbox_url, private_key_pem, key_id) do
    body = Jason.encode!(activity)

    Logger.info("Delivering activity to #{inbox_url}")

    # HttpSignature.sign returns string-keyed headers; convert to charlist tuples for Http.post
    headers =
      HttpSignature.sign("post", inbox_url, body, private_key_pem, key_id)
      |> Enum.map(fn {k, v} -> {String.to_charlist(k), String.to_charlist(v)} end)

    Http.post(inbox_url, body, headers)
  end
end
