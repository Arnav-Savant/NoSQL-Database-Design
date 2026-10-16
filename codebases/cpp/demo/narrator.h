#pragma once

#include <functional>
#include <string>
#include <vector>

namespace demo {

/// Prints chapter headings, explanations and operations in a consistent shape.
class Narrator {
 public:
  using Output = std::function<void(const std::string&)>;

  explicit Narrator(Output output = nullptr);

  void chapter(const std::string& number, const std::string& title, const std::vector<std::string>& paragraphs) const;
  void explain(const std::vector<std::string>& paragraphs) const;
  void operation(const std::string& description) const;
  void result(const std::string& text) const;
  void line(const std::string& text = "") const;

 private:
  Output output_;
};

// Width of text as JavaScript counts it for these ASCII and BMP strings: one per character.
std::size_t display_width(const std::string& text);

std::string pad_end(const std::string& text, std::size_t width);
std::string pad_start(const std::string& text, std::size_t width);

}  // namespace demo
