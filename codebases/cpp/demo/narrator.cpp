#include "demo/narrator.h"

#include <cctype>
#include <iostream>
#include <utility>

namespace demo {
namespace {

constexpr std::size_t kLineWidth = 78;

// Mirrors text.split(/\s+/): runs of whitespace separate words, and leading or trailing
// whitespace yields an empty word.
std::vector<std::string> split_on_whitespace(const std::string& text) {
  std::vector<std::string> words;
  std::string current;
  bool in_whitespace = false;
  for (const char character : text) {
    if (std::isspace(static_cast<unsigned char>(character)) != 0) {
      if (!in_whitespace) words.push_back(std::exchange(current, std::string()));
      in_whitespace = true;
    } else {
      current += character;
      in_whitespace = false;
    }
  }
  words.push_back(current);
  return words;
}

std::vector<std::string> wrap(const std::string& text, std::size_t width) {
  std::vector<std::string> lines;
  std::string current;
  for (const std::string& word : split_on_whitespace(text)) {
    if (!current.empty() && display_width(current) + 1 + display_width(word) > width) {
      lines.push_back(current);
      current = word;
    } else {
      current = !current.empty() ? current + " " + word : word;
    }
  }
  if (!current.empty()) lines.push_back(current);
  return lines;
}

}  // namespace

std::size_t display_width(const std::string& text) {
  std::size_t width = 0;
  for (const char character : text) {
    if ((static_cast<unsigned char>(character) & 0xc0) != 0x80) ++width;
  }
  return width;
}

std::string pad_end(const std::string& text, std::size_t width) {
  const std::size_t current = display_width(text);
  return current >= width ? text : text + std::string(width - current, ' ');
}

std::string pad_start(const std::string& text, std::size_t width) {
  const std::size_t current = display_width(text);
  return current >= width ? text : std::string(width - current, ' ') + text;
}

Narrator::Narrator(Output output) : output_(std::move(output)) {
  if (!output_) output_ = [](const std::string& line) { std::cout << line << '\n'; };
}

void Narrator::chapter(const std::string& number, const std::string& title,
                       const std::vector<std::string>& paragraphs) const {
  output_("");
  output_("== Chapter " + number + ": " + title + " ==");
  explain(paragraphs);
}

void Narrator::explain(const std::vector<std::string>& paragraphs) const {
  for (const std::string& paragraph : paragraphs) {
    output_("");
    for (const std::string& wrapped : wrap(paragraph, kLineWidth)) output_(wrapped);
  }
}

void Narrator::operation(const std::string& description) const {
  output_("");
  output_("> " + description);
}

void Narrator::result(const std::string& text) const { output_("  result: " + text); }

void Narrator::line(const std::string& text) const { output_(text); }

}  // namespace demo
