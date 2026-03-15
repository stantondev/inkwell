defmodule Inkwell.Import.Parsers.GenericCsvTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parsers.GenericCsv

  describe "parse/1" do
    test "parses CSV with standard column names" do
      csv = """
      title,body,date,tags
      My Post,This is plain text body,2025-06-15,tech;writing
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.title == "My Post"
      assert entry.body_html =~ "This is plain text body"
      assert entry.published_at.year == 2025
      assert "tech" in entry.tags
      assert "writing" in entry.tags
    end

    test "wraps plain text body in HTML paragraphs" do
      csv = """
      title,body
      Post,Just plain text
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.body_html == "<p>Just plain text</p>"
    end

    test "passes through HTML body unchanged" do
      csv = """
      title,body_html
      Post,<p>Already HTML</p>
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.body_html == "<p>Already HTML</p>"
    end

    test "supports alternative column names" do
      csv = """
      name,content,created_at,keywords
      Alt Title,Alt body,2025-01-01,tag1|tag2
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.title == "Alt Title"
      assert entry.body_html =~ "Alt body"
      assert entry.published_at != nil
      assert "tag1" in entry.tags
      assert "tag2" in entry.tags
    end

    test "supports heading/subject as title, text/html as body" do
      csv = """
      subject,text,publish_date
      Email Subject,Email body text,2025-03-01
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.title == "Email Subject"
      assert entry.body_html =~ "Email body text"
    end

    test "parses tags with comma, semicolon, and pipe separators" do
      csv = """
      title,body,tags
      Post1,Body,"a,b,c"
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert length(entry.tags) == 3
    end

    test "detects draft status" do
      csv = """
      title,body,status
      Draft Post,Content,draft
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.was_draft == true
    end

    test "detects draft from is_published=false" do
      csv = """
      title,body,is_published
      Post,Content,false
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.was_draft == true
    end

    test "extracts mood and music columns" do
      csv = """
      title,body,mood,music
      Post,Content,happy,https://spotify.com/track/123
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.mood == "happy"
      assert entry.music == "https://spotify.com/track/123"
    end

    test "skips entries with no title and no body" do
      csv = """
      title,body
      ,,
      Real Post,Real content
      """

      {:ok, entries} = GenericCsv.parse(csv)
      assert length(entries) == 1
    end

    test "returns empty list for header-only CSV" do
      csv = "title,body\n"
      {:ok, entries} = GenericCsv.parse(csv)
      assert entries == []
    end

    test "returns error for empty CSV" do
      assert {:error, "CSV file is empty"} = GenericCsv.parse("")
    end

    test "handles BOM-prefixed CSV" do
      bom = <<0xEF, 0xBB, 0xBF>>
      csv = "title,body\nBOM Test,Content\n"

      {:ok, [entry]} = GenericCsv.parse(bom <> csv)
      assert entry.title == "BOM Test"
    end

    test "is case-insensitive for column headers" do
      csv = """
      Title,Body,Date
      Post,Content,2025-01-01
      """

      {:ok, [entry]} = GenericCsv.parse(csv)
      assert entry.title == "Post"
    end
  end
end
