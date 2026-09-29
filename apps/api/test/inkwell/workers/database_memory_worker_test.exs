defmodule Inkwell.Workers.DatabaseMemoryWorkerTest do
  use ExUnit.Case, async: false

  alias Inkwell.Workers.DatabaseMemoryWorker, as: Worker

  @mb 1024 * 1024

  describe "evaluate/3" do
    test "no alert while free memory is above the threshold" do
      assert :ok = Worker.evaluate(%{available: 630 * @mb, total: 962 * @mb, instance: "m1"}, 100, "inkwell-db")
      assert :ok = Worker.evaluate(%{available: 100 * @mb, total: 962 * @mb, instance: "m1"}, 100, "inkwell-db")
    end

    test "alerts below the threshold with the upgrade command for the next size" do
      assert {:alert, text} =
               Worker.evaluate(%{available: 87 * @mb, total: 962 * @mb, instance: "4d8922d5a517e8"}, 100, "inkwell-db")

      assert text =~ "*87 MB* of 962 MB"
      # A 1 GB machine (reports 962 MB) doubles to 2048.
      assert text =~ "fly machine update 4d8922d5a517e8 --vm-memory 2048 -a inkwell-db"
      assert text =~ "transparency_costs"
    end

    test "still alerts when the total isn't known" do
      assert {:alert, text} = Worker.evaluate(%{available: 5 * @mb, total: nil, instance: nil}, 100, "inkwell-db")
      assert text =~ "*5 MB*"
      assert text =~ "--vm-memory 2048"
    end

    test "a 2 GB machine suggests 4 GB" do
      assert {:alert, text} = Worker.evaluate(%{available: 50 * @mb, total: 1950 * @mb, instance: "m"}, 100, "inkwell-db")
      assert text =~ "--vm-memory 4096"
    end
  end

  test "does nothing without a metrics token" do
    previous = Application.get_env(:inkwell, :db_memory_alert)
    Application.put_env(:inkwell, :db_memory_alert, %{token: nil})
    on_exit(fn -> Application.put_env(:inkwell, :db_memory_alert, previous) end)

    assert :ok = Worker.perform(%Oban.Job{args: %{}})
  end
end
