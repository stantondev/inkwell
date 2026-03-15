defmodule Inkwell.Import.Parsers.SubstackCsvTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.SubstackCsv

  describe "parse/1" do
    test "parses standard Substack CSV" do
      csv = """
      title,subtitle,post_date,body_html,is_published
      My Post,A cool subtitle,2025-06-15T10:00:00Z,<p>Hello world</p>,true
      """

      {:ok, [entry]} = SubstackCsv.parse(csv)
      assert entry.title == "My Post"
      assert entry.body_html =~ "<em>A cool subtitle</em>"
      assert entry.body_html =~ "Hello world"
      assert entry.published_at.year == 2025
      assert entry.was_draft == false
    end

    test "detects drafts from is_published column" do
      csv = """
      title,subtitle,post_date,body_html,is_published
      Draft Post,,2025-06-15,<p>Draft content</p>,false
      """

      {:ok, [entry]} = SubstackCsv.parse(csv)
      assert entry.was_draft == true
    end

    test "handles FALSE (uppercase) for draft detection" do
      csv = """
      title,subtitle,post_date,body_html,is_published
      Draft Post,,2025-06-15,<p>Content</p>,FALSE
      """

      {:ok, [entry]} = SubstackCsv.parse(csv)
      assert entry.was_draft == true
    end

    test "prepends subtitle as italic paragraph" do
      csv = """
      title,subtitle,post_date,body_html,is_published
      Post,My subtitle,2025-01-01,<p>Body</p>,true
      """

      {:ok, [entry]} = SubstackCsv.parse(csv)
      assert entry.body_html =~ "<p><em>My subtitle</em></p>"
      assert entry.body_html =~ "<p>Body</p>"
    end

    test "handles missing subtitle" do
      csv = """
      title,subtitle,post_date,body_html,is_published
      Post,,2025-01-01,<p>Body only</p>,true
      """

      {:ok, [entry]} = SubstackCsv.parse(csv)
      refute entry.body_html =~ "<em>"
      assert entry.body_html =~ "Body only"
    end

    test "skips entries with no title and no body" do
      csv = """
      title,subtitle,post_date,body_html,is_published
      ,,,, true
      Real Post,,2025-01-01,<p>Content</p>,true
      """

      {:ok, entries} = SubstackCsv.parse(csv)
      assert length(entries) == 1
      assert hd(entries).title == "Real Post"
    end

    test "returns empty list for header-only CSV" do
      csv = "title,subtitle,post_date,body_html,is_published\n"
      {:ok, entries} = SubstackCsv.parse(csv)
      assert entries == []
    end

    test "returns error for empty CSV" do
      assert {:error, _} = SubstackCsv.parse("")
    end

    test "handles BOM-prefixed CSV" do
      bom = <<0xEF, 0xBB, 0xBF>>
      csv = "title,post_date,body_html,is_published\nBOM Test,2025-01-01,<p>Content</p>,true\n"

      {:ok, [entry]} = SubstackCsv.parse(bom <> csv)
      assert entry.title == "BOM Test"
    end
  end
end
