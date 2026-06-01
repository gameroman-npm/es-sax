let S = 0;
const STATE: {
  readonly BEGIN: number; // leading byte order mark or whitespace
  readonly BEGIN_WHITESPACE: number; // leading whitespace
  readonly TEXT: number; // general stuff
  readonly TEXT_ENTITY: number; // &amp and such.
  readonly OPEN_WAKA: number; // <
  readonly SGML_DECL: number; // <!BLARG
  readonly SGML_DECL_QUOTED: number; // <!BLARG foo "bar
  readonly DOCTYPE: number; // <!DOCTYPE
  readonly DOCTYPE_QUOTED: number; // <!DOCTYPE "//blah
  readonly DOCTYPE_DTD: number; // <!DOCTYPE "//blah" [ ...
  readonly DOCTYPE_DTD_QUOTED: number; // <!DOCTYPE "//blah" [ "foo
  readonly COMMENT_STARTING: number; // <!-
  readonly COMMENT: number; // <!--
  readonly COMMENT_ENDING: number; // <!-- blah -
  readonly COMMENT_ENDED: number; // <!-- blah --
  readonly CDATA: number; // <![CDATA[ something
  readonly CDATA_ENDING: number; // ]
  readonly CDATA_ENDING_2: number; // ]]
  readonly PROC_INST: number; // <?hi
  readonly PROC_INST_BODY: number; // <?hi there
  readonly PROC_INST_ENDING: number; // <?hi "there" ?
  readonly OPEN_TAG: number; // <strong
  readonly OPEN_TAG_SLASH: number; // <strong /
  readonly ATTRIB: number; // <a
  readonly ATTRIB_NAME: number; // <a foo
  readonly ATTRIB_NAME_SAW_WHITE: number; // <a foo _
  readonly ATTRIB_VALUE: number; // <a foo=
  readonly ATTRIB_VALUE_QUOTED: number; // <a foo="bar
  readonly ATTRIB_VALUE_CLOSED: number; // <a foo="bar"
  readonly ATTRIB_VALUE_UNQUOTED: number; // <a foo=bar
  readonly ATTRIB_VALUE_ENTITY_Q: number; // <foo bar="&quot;"
  readonly ATTRIB_VALUE_ENTITY_U: number; // <foo bar=&quot
  readonly CLOSE_TAG: number; // </a
  readonly CLOSE_TAG_SAW_WHITE: number; // </a   >
  readonly SCRIPT: number; // <script> ...
  readonly SCRIPT_ENDING: number;
} = {
  BEGIN: S++, // leading byte order mark or whitespace
  BEGIN_WHITESPACE: S++, // leading whitespace
  TEXT: S++, // general stuff
  TEXT_ENTITY: S++, // &amp and such.
  OPEN_WAKA: S++, // <
  SGML_DECL: S++, // <!BLARG
  SGML_DECL_QUOTED: S++, // <!BLARG foo "bar
  DOCTYPE: S++, // <!DOCTYPE
  DOCTYPE_QUOTED: S++, // <!DOCTYPE "//blah
  DOCTYPE_DTD: S++, // <!DOCTYPE "//blah" [ ...
  DOCTYPE_DTD_QUOTED: S++, // <!DOCTYPE "//blah" [ "foo
  COMMENT_STARTING: S++, // <!-
  COMMENT: S++, // <!--
  COMMENT_ENDING: S++, // <!-- blah -
  COMMENT_ENDED: S++, // <!-- blah --
  CDATA: S++, // <![CDATA[ something
  CDATA_ENDING: S++, // ]
  CDATA_ENDING_2: S++, // ]]
  PROC_INST: S++, // <?hi
  PROC_INST_BODY: S++, // <?hi there
  PROC_INST_ENDING: S++, // <?hi "there" ?
  OPEN_TAG: S++, // <strong
  OPEN_TAG_SLASH: S++, // <strong /
  ATTRIB: S++, // <a
  ATTRIB_NAME: S++, // <a foo
  ATTRIB_NAME_SAW_WHITE: S++, // <a foo _
  ATTRIB_VALUE: S++, // <a foo=
  ATTRIB_VALUE_QUOTED: S++, // <a foo="bar
  ATTRIB_VALUE_CLOSED: S++, // <a foo="bar"
  ATTRIB_VALUE_UNQUOTED: S++, // <a foo=bar
  ATTRIB_VALUE_ENTITY_Q: S++, // <foo bar="&quot;"
  ATTRIB_VALUE_ENTITY_U: S++, // <foo bar=&quot
  CLOSE_TAG: S++, // </a
  CLOSE_TAG_SAW_WHITE: S++, // </a   >
  SCRIPT: S++, // <script> ...
  SCRIPT_ENDING: S++, // <script> ... <
} as const;

for (const s in STATE) {
  // @ts-expect-error
  STATE[STATE[s]] = s;
}

export { STATE };
