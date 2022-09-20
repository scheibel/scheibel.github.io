#!/bin/bash

cd `dirname $0`

for file in $(find -type f -ipath './bib/*.bib')
do
  cat $file
  echo ""
done | head -c-1 > scheibel-bibliography.bib
