#!/usr/bin/env perl
# Mask Iranian mobiles, Sheba (IR+24 digits), and 16-digit card numbers in psql output.
use strict;
use warnings;

while (my $line = <STDIN>) {
  # 09xxxxxxxxx (11 digits: 09 + 9 national digits; keep last 3)
  $line =~ s/(?<![\d+])09\d{6}(\d{3})(?!\d)/***$1/g;
  # +989xxxxxxxxx / 989xxxxxxxxx (98 + 9-digit mobile + last 3)
  $line =~ s/(?<!\d)\+989\d{7}(\d{3})(?!\d)/***$1/g;
  $line =~ s/(?<!\d)989\d{7}(\d{3})(?!\d)/***$1/g;
  # Sheba / IBAN Iran: IR + 24 digits
  $line =~ s/\bIR\d{21}(\d{3})\b/IR*********************$1/gi;
  # 16-digit card numbers (tabular / spaced in dumps)
  $line =~ s/(?<!\d)(\d{12})(\d{4})(?!\d)/***$2/g;
  print $line;
}
