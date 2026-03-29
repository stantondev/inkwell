defmodule Inkwell.SSL do
  @moduledoc """
  Shared SSL options for all outbound `:httpc` requests.

  Provides verify_peer + system CA certs + RFC 6125 wildcard hostname matching.
  Without `customize_hostname_check`, Erlang's default hostname verifier
  rejects wildcard certs like `*.slack.com` for `hooks.slack.com`.
  """

  @doc "Returns SSL options for `:httpc` requests."
  def httpc_opts do
    [
      {:verify, :verify_peer},
      {:cacerts, :public_key.cacerts_get()},
      {:depth, 3},
      {:customize_hostname_check, [{:match_fun, :public_key.pkix_verify_hostname_match_fun(:https)}]}
    ]
  end
end
