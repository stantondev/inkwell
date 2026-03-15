defmodule Inkwell.Import.ParserTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.Parser

  describe "parse_datetime/1" do
    test "parses ISO 8601 with timezone" do
      assert %DateTime{year: 2025, month: 6, day: 15, hour: 14, minute: 30, second: 0} =
               Parser.parse_datetime("2025-06-15T14:30:00Z")
    end

    test "parses ISO 8601 with offset" do
      result = Parser.parse_datetime("2025-06-15T14:30:00+05:00")
      assert %DateTime{} = result
    end

    test "parses NaiveDateTime format" do
      assert %DateTime{year: 2025, month: 1, day: 15, hour: 10, minute: 30, second: 0} =
               Parser.parse_datetime("2025-01-15T10:30:00")
    end

    test "parses WordPress format (YYYY-MM-DD HH:MM:SS)" do
      assert %DateTime{year: 2025, month: 6, day: 15, hour: 10, minute: 30, second: 0} =
               Parser.parse_datetime("2025-06-15 10:30:00")
    end

    test "parses date-only format" do
      assert %DateTime{year: 2025, month: 6, day: 15, hour: 0, minute: 0, second: 0} =
               Parser.parse_datetime("2025-06-15")
    end

    test "returns nil for nil input" do
      assert Parser.parse_datetime(nil) == nil
    end

    test "returns nil for empty string" do
      assert Parser.parse_datetime("") == nil
    end

    test "returns nil for garbage input" do
      assert Parser.parse_datetime("not a date") == nil
    end

    test "trims whitespace" do
      assert %DateTime{} = Parser.parse_datetime("  2025-06-15  ")
    end

    test "returns nil for non-binary input" do
      assert Parser.parse_datetime(12345) == nil
    end
  end

  describe "ensure_html/1" do
    test "returns nil for nil" do
      assert Parser.ensure_html(nil) == nil
    end

    test "returns nil for empty string" do
      assert Parser.ensure_html("") == nil
    end

    test "passes through existing HTML unchanged" do
      html = "<p>Hello world</p>"
      assert Parser.ensure_html(html) == html
    end

    test "wraps plain text in p tags" do
      assert Parser.ensure_html("Hello world") == "<p>Hello world</p>"
    end

    test "splits double newlines into separate paragraphs" do
      text = "First paragraph\n\nSecond paragraph"
      result = Parser.ensure_html(text)
      assert result == "<p>First paragraph</p>\n<p>Second paragraph</p>"
    end

    test "ignores empty paragraphs from multiple newlines" do
      text = "First\n\n\n\nSecond"
      result = Parser.ensure_html(text)
      assert result == "<p>First</p>\n<p>Second</p>"
    end
  end
end
