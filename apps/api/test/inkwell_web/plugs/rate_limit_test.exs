defmodule InkwellWeb.Plugs.RateLimitTest do
  @moduledoc """
  The bucket key decides who shares a rate limit, and getting it wrong is
  severe in both directions:

    * `List.last(x-forwarded-for)` is a Fly edge address that is identical for
      every user, so the whole platform shares one bucket. Measured in
      production, the chain arriving at the API is
      "<client>, <fly edge>, <web machine>, <fly edge>" because browsers hit the
      Next.js proxy, which re-enters Fly's edge.
    * `List.first` is the real client but is caller-controlled — a forged header
      prepends.

  So we prefer X-Inkwell-Client-IP (filled by our proxy from Fly's authoritative
  Fly-Client-IP) and only honour it when the immediate peer is internal.
  """
  use InkwellWeb.ConnCase, async: false

  alias InkwellWeb.Plugs.RateLimit

  @opts RateLimit.init(max_requests: 3, window_seconds: 300)

  setup do
    if :ets.whereis(:rate_limit_buckets) != :undefined do
      :ets.delete_all_objects(:rate_limit_buckets)
    end

    :ok
  end

  defp run(headers) do
    Enum.reduce(headers, build_conn(), fn {k, v}, c -> Plug.Conn.put_req_header(c, k, v) end)
    |> RateLimit.call(@opts)
  end

  defp bucket_keys do
    :rate_limit_buckets |> :ets.tab2list() |> Enum.map(fn {k, _} -> k end)
  end

  test "trusts X-Inkwell-Client-IP when the immediate peer is internal" do
    run([
      {"x-forwarded-for", "1.2.3.4, 66.241.124.129, 172.19.34.138, 66.241.125.222"},
      {"x-inkwell-client-ip", "203.0.113.7"},
      {"fly-client-ip", "172.19.34.138"}
    ])

    assert bucket_keys() == ["203.0.113.7"]
  end

  test "ignores X-Inkwell-Client-IP when the peer is public (forged direct call)" do
    run([
      {"x-forwarded-for", "198.51.100.9"},
      {"x-inkwell-client-ip", "203.0.113.7"},
      {"fly-client-ip", "198.51.100.9"}
    ])

    refute "203.0.113.7" in bucket_keys()
    assert bucket_keys() == ["198.51.100.9"]
  end

  test "falls back to the FIRST forwarded IP, never the trailing Fly edge" do
    run([{"x-forwarded-for", "69.108.42.204, 66.241.124.129, 172.19.34.138, 66.241.125.222"}])

    assert bucket_keys() == ["69.108.42.204"],
           "must not key on the trailing edge address — that bucket is shared by every user"
  end

  test "distinct clients get distinct buckets" do
    for ip <- ["203.0.113.1", "203.0.113.2", "203.0.113.3"] do
      run([{"x-inkwell-client-ip", ip}, {"fly-client-ip", "172.19.34.138"}])
    end

    assert length(bucket_keys()) == 3
  end

  test "blocks only the offending client once over the limit" do
    noisy = [{"x-inkwell-client-ip", "203.0.113.99"}, {"fly-client-ip", "fdaa::1"}]

    for _ <- 1..3, do: refute(run(noisy).halted)
    assert run(noisy).halted, "4th request from the same client should be limited"

    quiet = [{"x-inkwell-client-ip", "203.0.113.100"}, {"fly-client-ip", "fdaa::1"}]
    refute run(quiet).halted, "an unrelated client must not be affected"
  end

  test "blank trusted header falls through instead of bucketing everyone under empty string" do
    run([
      {"x-inkwell-client-ip", "   "},
      {"fly-client-ip", "172.19.34.138"},
      {"x-forwarded-for", "203.0.113.55"}
    ])

    assert bucket_keys() == ["203.0.113.55"]
  end
end
