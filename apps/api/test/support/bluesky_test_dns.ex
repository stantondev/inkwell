defmodule Inkwell.BlueskyTestDNS do
  @moduledoc "DNS for Bluesky handle tests: `Process.put({:bluesky_dns, name}, [\"did=...\"])`."
  def lookup(name), do: Process.get({:bluesky_dns, name}, [])
end
