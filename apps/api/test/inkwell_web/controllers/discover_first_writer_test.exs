defmodule InkwellWeb.DiscoverFirstWriterTest do
  @moduledoc """
  "Keep reading <writer> → Join free" on a shared post carries that writer
  through signup; onboarding's suggested writers (`?first=`) puts them first,
  unless there's a reason not to suggest them at all.
  """
  use InkwellWeb.ConnCase, async: false

  defp as(user), do: build_conn() |> log_in_user(user)

  defp writers(user, first) do
    as(user) |> get("/api/discover/writers?first=#{first}") |> json_response(200) |> Map.fetch!("data")
  end

  defp publish(user, n) do
    for i <- 1..n do
      {:ok, _} =
        Inkwell.Journals.create_entry(%{
          "user_id" => user.id,
          "title" => "Entry #{i}",
          "body_html" => "<p>words</p>",
          "privacy" => "public"
        })
    end
  end

  test "the writer who brought someone here comes first, marked" do
    reader = create_user()
    writer = create_user()
    other = create_user()
    publish(writer, 1)
    publish(other, 4)

    [first | rest] = writers(reader, writer.username)
    assert first["username"] == writer.username
    assert first["brought_you"] == true
    assert first["entry_count"] == 1
    refute Enum.any?(rest, &(&1["username"] == writer.username))
    assert Enum.all?(rest, &(&1["brought_you"] == false))
  end

  test "nobody is put first for an unknown name, yourself, a block, or someone already followed" do
    reader = create_user()
    writer = create_user()
    publish(writer, 1)

    refute Enum.any?(writers(reader, "nobody_by_this_name"), & &1["brought_you"])
    refute Enum.any?(writers(reader, reader.username), & &1["brought_you"])

    {:ok, _} = Inkwell.Social.follow(reader.id, writer.id)
    refute Enum.any?(writers(reader, writer.username), & &1["brought_you"])

    blocker = create_user()
    publish(blocker, 1)
    {:ok, _} = Inkwell.Social.block(blocker.id, reader.id)
    refute Enum.any?(writers(reader, blocker.username), &(&1["username"] == blocker.username))
  end
end
