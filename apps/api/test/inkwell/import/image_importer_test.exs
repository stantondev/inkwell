defmodule Inkwell.Import.ImageImporterTest do
  use ExUnit.Case, async: true

  alias Inkwell.Import.ImageImporter

  describe "extract_image_urls/1" do
    test "extracts src from img tags" do
      html = ~s(<p>Text</p><img src="https://example.com/photo.jpg" alt="Photo"><p>More</p>)
      urls = ImageImporter.extract_image_urls(html)
      assert urls == ["https://example.com/photo.jpg"]
    end

    test "extracts multiple image URLs" do
      html = ~s(<img src="https://a.com/1.jpg"><img src="https://b.com/2.png">)
      urls = ImageImporter.extract_image_urls(html)
      assert length(urls) == 2
      assert "https://a.com/1.jpg" in urls
      assert "https://b.com/2.png" in urls
    end

    test "deduplicates URLs" do
      html = ~s(<img src="https://a.com/1.jpg"><img src="https://a.com/1.jpg">)
      urls = ImageImporter.extract_image_urls(html)
      assert length(urls) == 1
    end

    test "handles self-closing img tags" do
      html = ~s(<img src="https://a.com/1.jpg" />)
      urls = ImageImporter.extract_image_urls(html)
      assert urls == ["https://a.com/1.jpg"]
    end

    test "handles img with many attributes" do
      html = ~s(<img class="wp-image" width="800" src="https://a.com/1.jpg" alt="test" height="600">)
      urls = ImageImporter.extract_image_urls(html)
      assert urls == ["https://a.com/1.jpg"]
    end

    test "returns empty list for no images" do
      html = "<p>No images here</p>"
      assert ImageImporter.extract_image_urls(html) == []
    end

    test "ignores data URI images" do
      html = ~s(<img src="data:image/png;base64,iVBORw0KG...">)
      urls = ImageImporter.extract_image_urls(html)
      # data URIs are extracted but filtered as non-external in localize_images
      assert length(urls) == 1
    end
  end

  describe "localize_images/2" do
    test "returns nil for nil input" do
      assert ImageImporter.localize_images(nil, "user-id") == nil
    end

    test "returns empty string for empty input" do
      assert ImageImporter.localize_images("", "user-id") == ""
    end

    test "returns unchanged HTML when no external images" do
      html = "<p>No images</p>"
      assert ImageImporter.localize_images(html, "user-id") == html
    end

    test "returns unchanged HTML when only local images" do
      html = ~s(<img src="/api/images/abc123">)
      assert ImageImporter.localize_images(html, "user-id") == html
    end

    test "returns unchanged HTML when only data URI images" do
      html = ~s(<img src="data:image/png;base64,abc123">)
      assert ImageImporter.localize_images(html, "user-id") == html
    end
  end
end
