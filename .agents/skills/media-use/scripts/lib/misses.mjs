| null,
      type: "self-position",

      /**
       * A self position keyword.
       */
      value: SelfPosition,
    |};
/**
 * A [`<self-position>`](https://www.w3.org/TR/css-align-3/#typedef-self-position) value.
 */
export type SelfPosition =
  | "center"
  | "start"
  | "end"
  | "self-start"
  | "self-end"
  | "flex-start"
  | "flex-end";
/**
 * A value for the [justify-self](https://www.w3.org/TR/css-align-3/#justify-self-property) property.
 */
export type JustifySelf =
  | {|
      type: "auto",
    |}
  | {|
      type: "normal",
    |}
  | {|
      type: "stretch",
    |}
  | {|
      type: "baseline-position",
      value: BaselinePosition,
    |}
  | {|
      /**
       * An overflow alignment mode.
       */
      overflow?: OverflowPosition | null,
      type: "self-position",

      /**
       * A self position keyword.
       */
      value: SelfPosition,
    |}
  | {|
      /**
       * An overflow alignment mode.
       */
      overflow?: OverflowPosition | null,
      type: "left",
    |}
  | {|
      /**
       * An overflow alignment mode.
       */
      overflow?: OverflowPosition | null,
      type: "right",
    |};
/**
 * A value for the [align-items](https://www.w3.org/TR/css-align-3/#