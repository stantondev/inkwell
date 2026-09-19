defmodule Inkwell.Federation.Background do
  @moduledoc """
  Runs federation side work (looking up remote inboxes, queueing deliveries)
  outside the request, so a slow remote server never delays the response.

  Tests set `config :inkwell, :federation_background, false` to run it inline,
  where it can be asserted on and can't outlive the test's database sandbox.
  """

  def run(fun) when is_function(fun, 0) do
    if Application.get_env(:inkwell, :federation_background, true) do
      Task.start(fun)
    else
      fun.()
      :ok
    end
  end
end
