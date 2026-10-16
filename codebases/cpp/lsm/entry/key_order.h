#pragma once

#include <string>

namespace lsm {

// Keys are ordered by their UTF-8 bytes, compared as unsigned values. Every language port uses
// the same rule, so a table sorted by one port can be searched by another.
// std::string::compare goes through char_traits<char>, which compares as unsigned char.
inline int compare_keys(const std::string& left, const std::string& right) {
  const int order = left.compare(right);
  return (order > 0) - (order < 0);
}

}  // namespace lsm
