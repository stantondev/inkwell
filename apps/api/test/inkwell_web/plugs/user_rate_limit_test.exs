defmodule InkwellWeb.Plugs.UserRateLimitTest do
  @moduledoc """
  Writes keep the 30-per-minute cap; reads get their own, larger allowance so
  page loads and progress polling can't lock someone out of their own
  entries (2026-09-22: the import page's poll made the editor fail to load).
  """
  use ExUnit.Case, async: false
  import Plug.Test

  alias InkwellWeb.Plugs.UserRateLimit

  @opts UserRateLimit.init(max_requests: 3, window_seconds: 60)

  defp run(method, user_id) do
    conn(method, "/api/anything")
    |> Plug.Conn.assign(:current_user, %{id: user_id})
    |> UserRateLimit.call(@opts)
  end

  test "reads don't use up the write allowance" do
    user = Ecto.UUID.generate()
    for _ <- 1..10, do: refute(run(:get, user).halted)
    for _ <- 1..3, do: refute(run(:post, user).halted)
    assert run(:post, user).status == 429
  end

  test "reads have their own, larger cap" do
    user = Ecto.UUID.generate()
    for _ <- 1..30, do: refute(run(:get, user).halted)
    assert run(:get, user).status == 429
    # Writes are still allowed.
    refute run(:patch, user).halted
  end
end
