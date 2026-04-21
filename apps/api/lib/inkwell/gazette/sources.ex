defmodule Inkwell.Gazette.Sources do
  @moduledoc """
  List of Mastodon-compatible source instances polled by the Gazette hashtag
  ingestion pipeline. Each instance is expected to expose the standard
  `/api/v1/timelines/tag/:hashtag` endpoint as an unauthenticated public
  timeline.

  The list is overridable via application config (`:inkwell, :gazette_sources`)
  so the set of sources can be tuned on production without a code deploy —
  set the `GAZETTE_SOURCES` Fly secret to a comma-separated list of hostnames
  and restart the API machines.
  """

  @default_instances [
    "mastodon.social",
    "mstdn.social",
    "mastodon.online",
    "fosstodon.org",
    "mas.to"
  ]

  @doc "Returns the list of source instance hostnames."
  def instances do
    case Application.get_env(:inkwell, :gazette_sources) do
      list when is_list(list) and list != [] -> list
      _ -> @default_instances
    end
  end
end
