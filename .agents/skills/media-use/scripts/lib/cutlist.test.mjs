alue: BorderSideWidth,
    |}
  | {|
      property: "flex-direction",
      value: FlexDirection,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-wrap",
      value: FlexWrap,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-flow",
      value: FlexFlow,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-grow",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-shrink",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-basis",
      value: LengthPercentageOrAuto,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex",
      value: Flex,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "order",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "align-content",
      value: AlignContent,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "justify-content",
      value: JustifyContent,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "place-content",
      value: PlaceContent,
    |}
  | {|
      property: "align-self",
      value: AlignSelf,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "justify-self",
      value: JustifySelf,
    |}
  | {|
      property: "place-self",
      value: PlaceSelf,
    |}
  | {|
      property: "align-items",
      value: AlignItems,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "justify-items",
      value: JustifyItems,
    |}
  | {|
      property: "place-items",
      value: PlaceItems,
    |}
  | {|
      property: "row-gap",
      value: GapValue,
    |}
  | {|
      property: "column-gap",
      value: GapValue,
    |}
  | {|
      property: "gap",
      value: Gap,
    |}
  | {|
      property: "box-orient",
      value: BoxOrient,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-direction",
      value: BoxDirection,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-ordinal-group",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-align",
      value: BoxAlign,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-flex",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-flex-group",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-pack",
      value: BoxPack,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "box-lines",
      value: BoxLines,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-pack",
      value: FlexPack,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-order",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-align",
      value: BoxAlign,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-item-align",
      value: FlexItemAlign,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-line-pack",
      value: FlexLinePack,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-positive",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-negative",
      value: number,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "flex-preferred-size",
      value: LengthPercentageOrAuto,
      vendorPrefix: VendorPrefix,
    |}
  | {|
      property: "grid-template-columns",
      value: TrackSizing,
    |}
  | {|
      property: "grid-template-rows",
      value: TrackSizing,
    |}
  | {|
      property: "grid-auto-columns",
      value: TrackSize[],
    |}
  | {|
      property: "grid-auto-rows",
      value: TrackSize[],
    |}
  | {|
      property: "grid-auto-flow",
      value: GridAutoFlow,
    |}
  | {|
      property: "grid-template-areas",
      value: GridTemplateAreas,
    |}
  | {|
      property: "grid-template",
      value: GridTemplate,
    |}
  | {|
      property: "grid",
      value: 