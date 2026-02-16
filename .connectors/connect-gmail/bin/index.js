#!/usr/bin/env bun
// @bun
var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __toESM = (mod, isNodeMode, target) => {
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: () => mod[key],
        enumerable: true
      });
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);
var __require = import.meta.require;

// node_modules/commander/lib/error.js
var require_error = __commonJS((exports) => {
  class CommanderError extends Error {
    constructor(exitCode, code, message) {
      super(message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
      this.code = code;
      this.exitCode = exitCode;
      this.nestedError = undefined;
    }
  }

  class InvalidArgumentError extends CommanderError {
    constructor(message) {
      super(1, "commander.invalidArgument", message);
      Error.captureStackTrace(this, this.constructor);
      this.name = this.constructor.name;
    }
  }
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
});

// node_modules/commander/lib/argument.js
var require_argument = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Argument {
    constructor(name, description) {
      this.description = description || "";
      this.variadic = false;
      this.parseArg = undefined;
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.argChoices = undefined;
      switch (name[0]) {
        case "<":
          this.required = true;
          this._name = name.slice(1, -1);
          break;
        case "[":
          this.required = false;
          this._name = name.slice(1, -1);
          break;
        default:
          this.required = true;
          this._name = name;
          break;
      }
      if (this._name.length > 3 && this._name.slice(-3) === "...") {
        this.variadic = true;
        this._name = this._name.slice(0, -3);
      }
    }
    name() {
      return this._name;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    argRequired() {
      this.required = true;
      return this;
    }
    argOptional() {
      this.required = false;
      return this;
    }
  }
  function humanReadableArgName(arg) {
    const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
    return arg.required ? "<" + nameOutput + ">" : "[" + nameOutput + "]";
  }
  exports.Argument = Argument;
  exports.humanReadableArgName = humanReadableArgName;
});

// node_modules/commander/lib/help.js
var require_help = __commonJS((exports) => {
  var { humanReadableArgName } = require_argument();

  class Help {
    constructor() {
      this.helpWidth = undefined;
      this.sortSubcommands = false;
      this.sortOptions = false;
      this.showGlobalOptions = false;
    }
    visibleCommands(cmd) {
      const visibleCommands = cmd.commands.filter((cmd2) => !cmd2._hidden);
      const helpCommand = cmd._getHelpCommand();
      if (helpCommand && !helpCommand._hidden) {
        visibleCommands.push(helpCommand);
      }
      if (this.sortSubcommands) {
        visibleCommands.sort((a, b) => {
          return a.name().localeCompare(b.name());
        });
      }
      return visibleCommands;
    }
    compareOptions(a, b) {
      const getSortKey = (option) => {
        return option.short ? option.short.replace(/^-/, "") : option.long.replace(/^--/, "");
      };
      return getSortKey(a).localeCompare(getSortKey(b));
    }
    visibleOptions(cmd) {
      const visibleOptions = cmd.options.filter((option) => !option.hidden);
      const helpOption = cmd._getHelpOption();
      if (helpOption && !helpOption.hidden) {
        const removeShort = helpOption.short && cmd._findOption(helpOption.short);
        const removeLong = helpOption.long && cmd._findOption(helpOption.long);
        if (!removeShort && !removeLong) {
          visibleOptions.push(helpOption);
        } else if (helpOption.long && !removeLong) {
          visibleOptions.push(cmd.createOption(helpOption.long, helpOption.description));
        } else if (helpOption.short && !removeShort) {
          visibleOptions.push(cmd.createOption(helpOption.short, helpOption.description));
        }
      }
      if (this.sortOptions) {
        visibleOptions.sort(this.compareOptions);
      }
      return visibleOptions;
    }
    visibleGlobalOptions(cmd) {
      if (!this.showGlobalOptions)
        return [];
      const globalOptions = [];
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        const visibleOptions = ancestorCmd.options.filter((option) => !option.hidden);
        globalOptions.push(...visibleOptions);
      }
      if (this.sortOptions) {
        globalOptions.sort(this.compareOptions);
      }
      return globalOptions;
    }
    visibleArguments(cmd) {
      if (cmd._argsDescription) {
        cmd.registeredArguments.forEach((argument) => {
          argument.description = argument.description || cmd._argsDescription[argument.name()] || "";
        });
      }
      if (cmd.registeredArguments.find((argument) => argument.description)) {
        return cmd.registeredArguments;
      }
      return [];
    }
    subcommandTerm(cmd) {
      const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd._name + (cmd._aliases[0] ? "|" + cmd._aliases[0] : "") + (cmd.options.length ? " [options]" : "") + (args ? " " + args : "");
    }
    optionTerm(option) {
      return option.flags;
    }
    argumentTerm(argument) {
      return argument.name();
    }
    longestSubcommandTermLength(cmd, helper) {
      return helper.visibleCommands(cmd).reduce((max, command) => {
        return Math.max(max, helper.subcommandTerm(command).length);
      }, 0);
    }
    longestOptionTermLength(cmd, helper) {
      return helper.visibleOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestGlobalOptionTermLength(cmd, helper) {
      return helper.visibleGlobalOptions(cmd).reduce((max, option) => {
        return Math.max(max, helper.optionTerm(option).length);
      }, 0);
    }
    longestArgumentTermLength(cmd, helper) {
      return helper.visibleArguments(cmd).reduce((max, argument) => {
        return Math.max(max, helper.argumentTerm(argument).length);
      }, 0);
    }
    commandUsage(cmd) {
      let cmdName = cmd._name;
      if (cmd._aliases[0]) {
        cmdName = cmdName + "|" + cmd._aliases[0];
      }
      let ancestorCmdNames = "";
      for (let ancestorCmd = cmd.parent;ancestorCmd; ancestorCmd = ancestorCmd.parent) {
        ancestorCmdNames = ancestorCmd.name() + " " + ancestorCmdNames;
      }
      return ancestorCmdNames + cmdName + " " + cmd.usage();
    }
    commandDescription(cmd) {
      return cmd.description();
    }
    subcommandDescription(cmd) {
      return cmd.summary() || cmd.description();
    }
    optionDescription(option) {
      const extraInfo = [];
      if (option.argChoices) {
        extraInfo.push(`choices: ${option.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (option.defaultValue !== undefined) {
        const showDefault = option.required || option.optional || option.isBoolean() && typeof option.defaultValue === "boolean";
        if (showDefault) {
          extraInfo.push(`default: ${option.defaultValueDescription || JSON.stringify(option.defaultValue)}`);
        }
      }
      if (option.presetArg !== undefined && option.optional) {
        extraInfo.push(`preset: ${JSON.stringify(option.presetArg)}`);
      }
      if (option.envVar !== undefined) {
        extraInfo.push(`env: ${option.envVar}`);
      }
      if (extraInfo.length > 0) {
        return `${option.description} (${extraInfo.join(", ")})`;
      }
      return option.description;
    }
    argumentDescription(argument) {
      const extraInfo = [];
      if (argument.argChoices) {
        extraInfo.push(`choices: ${argument.argChoices.map((choice) => JSON.stringify(choice)).join(", ")}`);
      }
      if (argument.defaultValue !== undefined) {
        extraInfo.push(`default: ${argument.defaultValueDescription || JSON.stringify(argument.defaultValue)}`);
      }
      if (extraInfo.length > 0) {
        const extraDescripton = `(${extraInfo.join(", ")})`;
        if (argument.description) {
          return `${argument.description} ${extraDescripton}`;
        }
        return extraDescripton;
      }
      return argument.description;
    }
    formatHelp(cmd, helper) {
      const termWidth = helper.padWidth(cmd, helper);
      const helpWidth = helper.helpWidth || 80;
      const itemIndentWidth = 2;
      const itemSeparatorWidth = 2;
      function formatItem(term, description) {
        if (description) {
          const fullText = `${term.padEnd(termWidth + itemSeparatorWidth)}${description}`;
          return helper.wrap(fullText, helpWidth - itemIndentWidth, termWidth + itemSeparatorWidth);
        }
        return term;
      }
      function formatList(textArray) {
        return textArray.join(`
`).replace(/^/gm, " ".repeat(itemIndentWidth));
      }
      let output = [`Usage: ${helper.commandUsage(cmd)}`, ""];
      const commandDescription = helper.commandDescription(cmd);
      if (commandDescription.length > 0) {
        output = output.concat([
          helper.wrap(commandDescription, helpWidth, 0),
          ""
        ]);
      }
      const argumentList = helper.visibleArguments(cmd).map((argument) => {
        return formatItem(helper.argumentTerm(argument), helper.argumentDescription(argument));
      });
      if (argumentList.length > 0) {
        output = output.concat(["Arguments:", formatList(argumentList), ""]);
      }
      const optionList = helper.visibleOptions(cmd).map((option) => {
        return formatItem(helper.optionTerm(option), helper.optionDescription(option));
      });
      if (optionList.length > 0) {
        output = output.concat(["Options:", formatList(optionList), ""]);
      }
      if (this.showGlobalOptions) {
        const globalOptionList = helper.visibleGlobalOptions(cmd).map((option) => {
          return formatItem(helper.optionTerm(option), helper.optionDescription(option));
        });
        if (globalOptionList.length > 0) {
          output = output.concat([
            "Global Options:",
            formatList(globalOptionList),
            ""
          ]);
        }
      }
      const commandList = helper.visibleCommands(cmd).map((cmd2) => {
        return formatItem(helper.subcommandTerm(cmd2), helper.subcommandDescription(cmd2));
      });
      if (commandList.length > 0) {
        output = output.concat(["Commands:", formatList(commandList), ""]);
      }
      return output.join(`
`);
    }
    padWidth(cmd, helper) {
      return Math.max(helper.longestOptionTermLength(cmd, helper), helper.longestGlobalOptionTermLength(cmd, helper), helper.longestSubcommandTermLength(cmd, helper), helper.longestArgumentTermLength(cmd, helper));
    }
    wrap(str, width, indent, minColumnWidth = 40) {
      const indents = " \\f\\t\\v\xA0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF";
      const manualIndent = new RegExp(`[\\n][${indents}]+`);
      if (str.match(manualIndent))
        return str;
      const columnWidth = width - indent;
      if (columnWidth < minColumnWidth)
        return str;
      const leadingStr = str.slice(0, indent);
      const columnText = str.slice(indent).replace(`\r
`, `
`);
      const indentString = " ".repeat(indent);
      const zeroWidthSpace = "\u200B";
      const breaks = `\\s${zeroWidthSpace}`;
      const regex = new RegExp(`
|.{1,${columnWidth - 1}}([${breaks}]|$)|[^${breaks}]+?([${breaks}]|$)`, "g");
      const lines = columnText.match(regex) || [];
      return leadingStr + lines.map((line, i) => {
        if (line === `
`)
          return "";
        return (i > 0 ? indentString : "") + line.trimEnd();
      }).join(`
`);
    }
  }
  exports.Help = Help;
});

// node_modules/commander/lib/option.js
var require_option = __commonJS((exports) => {
  var { InvalidArgumentError } = require_error();

  class Option {
    constructor(flags, description) {
      this.flags = flags;
      this.description = description || "";
      this.required = flags.includes("<");
      this.optional = flags.includes("[");
      this.variadic = /\w\.\.\.[>\]]$/.test(flags);
      this.mandatory = false;
      const optionFlags = splitOptionFlags(flags);
      this.short = optionFlags.shortFlag;
      this.long = optionFlags.longFlag;
      this.negate = false;
      if (this.long) {
        this.negate = this.long.startsWith("--no-");
      }
      this.defaultValue = undefined;
      this.defaultValueDescription = undefined;
      this.presetArg = undefined;
      this.envVar = undefined;
      this.parseArg = undefined;
      this.hidden = false;
      this.argChoices = undefined;
      this.conflictsWith = [];
      this.implied = undefined;
    }
    default(value, description) {
      this.defaultValue = value;
      this.defaultValueDescription = description;
      return this;
    }
    preset(arg) {
      this.presetArg = arg;
      return this;
    }
    conflicts(names) {
      this.conflictsWith = this.conflictsWith.concat(names);
      return this;
    }
    implies(impliedOptionValues) {
      let newImplied = impliedOptionValues;
      if (typeof impliedOptionValues === "string") {
        newImplied = { [impliedOptionValues]: true };
      }
      this.implied = Object.assign(this.implied || {}, newImplied);
      return this;
    }
    env(name) {
      this.envVar = name;
      return this;
    }
    argParser(fn) {
      this.parseArg = fn;
      return this;
    }
    makeOptionMandatory(mandatory = true) {
      this.mandatory = !!mandatory;
      return this;
    }
    hideHelp(hide = true) {
      this.hidden = !!hide;
      return this;
    }
    _concatValue(value, previous) {
      if (previous === this.defaultValue || !Array.isArray(previous)) {
        return [value];
      }
      return previous.concat(value);
    }
    choices(values) {
      this.argChoices = values.slice();
      this.parseArg = (arg, previous) => {
        if (!this.argChoices.includes(arg)) {
          throw new InvalidArgumentError(`Allowed choices are ${this.argChoices.join(", ")}.`);
        }
        if (this.variadic) {
          return this._concatValue(arg, previous);
        }
        return arg;
      };
      return this;
    }
    name() {
      if (this.long) {
        return this.long.replace(/^--/, "");
      }
      return this.short.replace(/^-/, "");
    }
    attributeName() {
      return camelcase(this.name().replace(/^no-/, ""));
    }
    is(arg) {
      return this.short === arg || this.long === arg;
    }
    isBoolean() {
      return !this.required && !this.optional && !this.negate;
    }
  }

  class DualOptions {
    constructor(options) {
      this.positiveOptions = new Map;
      this.negativeOptions = new Map;
      this.dualOptions = new Set;
      options.forEach((option) => {
        if (option.negate) {
          this.negativeOptions.set(option.attributeName(), option);
        } else {
          this.positiveOptions.set(option.attributeName(), option);
        }
      });
      this.negativeOptions.forEach((value, key) => {
        if (this.positiveOptions.has(key)) {
          this.dualOptions.add(key);
        }
      });
    }
    valueFromOption(value, option) {
      const optionKey = option.attributeName();
      if (!this.dualOptions.has(optionKey))
        return true;
      const preset = this.negativeOptions.get(optionKey).presetArg;
      const negativeValue = preset !== undefined ? preset : false;
      return option.negate === (negativeValue === value);
    }
  }
  function camelcase(str) {
    return str.split("-").reduce((str2, word) => {
      return str2 + word[0].toUpperCase() + word.slice(1);
    });
  }
  function splitOptionFlags(flags) {
    let shortFlag;
    let longFlag;
    const flagParts = flags.split(/[ |,]+/);
    if (flagParts.length > 1 && !/^[[<]/.test(flagParts[1]))
      shortFlag = flagParts.shift();
    longFlag = flagParts.shift();
    if (!shortFlag && /^-[^-]$/.test(longFlag)) {
      shortFlag = longFlag;
      longFlag = undefined;
    }
    return { shortFlag, longFlag };
  }
  exports.Option = Option;
  exports.DualOptions = DualOptions;
});

// node_modules/commander/lib/suggestSimilar.js
var require_suggestSimilar = __commonJS((exports) => {
  var maxDistance = 3;
  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > maxDistance)
      return Math.max(a.length, b.length);
    const d = [];
    for (let i = 0;i <= a.length; i++) {
      d[i] = [i];
    }
    for (let j = 0;j <= b.length; j++) {
      d[0][j] = j;
    }
    for (let j = 1;j <= b.length; j++) {
      for (let i = 1;i <= a.length; i++) {
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
        } else {
          cost = 1;
        }
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
      }
    }
    return d[a.length][b.length];
  }
  function suggestSimilar(word, candidates) {
    if (!candidates || candidates.length === 0)
      return "";
    candidates = Array.from(new Set(candidates));
    const searchingOptions = word.startsWith("--");
    if (searchingOptions) {
      word = word.slice(2);
      candidates = candidates.map((candidate) => candidate.slice(2));
    }
    let similar = [];
    let bestDistance = maxDistance;
    const minSimilarity = 0.4;
    candidates.forEach((candidate) => {
      if (candidate.length <= 1)
        return;
      const distance = editDistance(word, candidate);
      const length = Math.max(word.length, candidate.length);
      const similarity = (length - distance) / length;
      if (similarity > minSimilarity) {
        if (distance < bestDistance) {
          bestDistance = distance;
          similar = [candidate];
        } else if (distance === bestDistance) {
          similar.push(candidate);
        }
      }
    });
    similar.sort((a, b) => a.localeCompare(b));
    if (searchingOptions) {
      similar = similar.map((candidate) => `--${candidate}`);
    }
    if (similar.length > 1) {
      return `
(Did you mean one of ${similar.join(", ")}?)`;
    }
    if (similar.length === 1) {
      return `
(Did you mean ${similar[0]}?)`;
    }
    return "";
  }
  exports.suggestSimilar = suggestSimilar;
});

// node_modules/commander/lib/command.js
var require_command = __commonJS((exports) => {
  var EventEmitter = __require("events").EventEmitter;
  var childProcess = __require("child_process");
  var path = __require("path");
  var fs = __require("fs");
  var process2 = __require("process");
  var { Argument, humanReadableArgName } = require_argument();
  var { CommanderError } = require_error();
  var { Help } = require_help();
  var { Option, DualOptions } = require_option();
  var { suggestSimilar } = require_suggestSimilar();

  class Command extends EventEmitter {
    constructor(name) {
      super();
      this.commands = [];
      this.options = [];
      this.parent = null;
      this._allowUnknownOption = false;
      this._allowExcessArguments = true;
      this.registeredArguments = [];
      this._args = this.registeredArguments;
      this.args = [];
      this.rawArgs = [];
      this.processedArgs = [];
      this._scriptPath = null;
      this._name = name || "";
      this._optionValues = {};
      this._optionValueSources = {};
      this._storeOptionsAsProperties = false;
      this._actionHandler = null;
      this._executableHandler = false;
      this._executableFile = null;
      this._executableDir = null;
      this._defaultCommandName = null;
      this._exitCallback = null;
      this._aliases = [];
      this._combineFlagAndOptionalValue = true;
      this._description = "";
      this._summary = "";
      this._argsDescription = undefined;
      this._enablePositionalOptions = false;
      this._passThroughOptions = false;
      this._lifeCycleHooks = {};
      this._showHelpAfterError = false;
      this._showSuggestionAfterError = true;
      this._outputConfiguration = {
        writeOut: (str) => process2.stdout.write(str),
        writeErr: (str) => process2.stderr.write(str),
        getOutHelpWidth: () => process2.stdout.isTTY ? process2.stdout.columns : undefined,
        getErrHelpWidth: () => process2.stderr.isTTY ? process2.stderr.columns : undefined,
        outputError: (str, write) => write(str)
      };
      this._hidden = false;
      this._helpOption = undefined;
      this._addImplicitHelpCommand = undefined;
      this._helpCommand = undefined;
      this._helpConfiguration = {};
    }
    copyInheritedSettings(sourceCommand) {
      this._outputConfiguration = sourceCommand._outputConfiguration;
      this._helpOption = sourceCommand._helpOption;
      this._helpCommand = sourceCommand._helpCommand;
      this._helpConfiguration = sourceCommand._helpConfiguration;
      this._exitCallback = sourceCommand._exitCallback;
      this._storeOptionsAsProperties = sourceCommand._storeOptionsAsProperties;
      this._combineFlagAndOptionalValue = sourceCommand._combineFlagAndOptionalValue;
      this._allowExcessArguments = sourceCommand._allowExcessArguments;
      this._enablePositionalOptions = sourceCommand._enablePositionalOptions;
      this._showHelpAfterError = sourceCommand._showHelpAfterError;
      this._showSuggestionAfterError = sourceCommand._showSuggestionAfterError;
      return this;
    }
    _getCommandAndAncestors() {
      const result = [];
      for (let command = this;command; command = command.parent) {
        result.push(command);
      }
      return result;
    }
    command(nameAndArgs, actionOptsOrExecDesc, execOpts) {
      let desc = actionOptsOrExecDesc;
      let opts = execOpts;
      if (typeof desc === "object" && desc !== null) {
        opts = desc;
        desc = null;
      }
      opts = opts || {};
      const [, name, args] = nameAndArgs.match(/([^ ]+) *(.*)/);
      const cmd = this.createCommand(name);
      if (desc) {
        cmd.description(desc);
        cmd._executableHandler = true;
      }
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      cmd._hidden = !!(opts.noHelp || opts.hidden);
      cmd._executableFile = opts.executableFile || null;
      if (args)
        cmd.arguments(args);
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd.copyInheritedSettings(this);
      if (desc)
        return this;
      return cmd;
    }
    createCommand(name) {
      return new Command(name);
    }
    createHelp() {
      return Object.assign(new Help, this.configureHelp());
    }
    configureHelp(configuration) {
      if (configuration === undefined)
        return this._helpConfiguration;
      this._helpConfiguration = configuration;
      return this;
    }
    configureOutput(configuration) {
      if (configuration === undefined)
        return this._outputConfiguration;
      Object.assign(this._outputConfiguration, configuration);
      return this;
    }
    showHelpAfterError(displayHelp = true) {
      if (typeof displayHelp !== "string")
        displayHelp = !!displayHelp;
      this._showHelpAfterError = displayHelp;
      return this;
    }
    showSuggestionAfterError(displaySuggestion = true) {
      this._showSuggestionAfterError = !!displaySuggestion;
      return this;
    }
    addCommand(cmd, opts) {
      if (!cmd._name) {
        throw new Error(`Command passed to .addCommand() must have a name
- specify the name in Command constructor or using .name()`);
      }
      opts = opts || {};
      if (opts.isDefault)
        this._defaultCommandName = cmd._name;
      if (opts.noHelp || opts.hidden)
        cmd._hidden = true;
      this._registerCommand(cmd);
      cmd.parent = this;
      cmd._checkForBrokenPassThrough();
      return this;
    }
    createArgument(name, description) {
      return new Argument(name, description);
    }
    argument(name, description, fn, defaultValue) {
      const argument = this.createArgument(name, description);
      if (typeof fn === "function") {
        argument.default(defaultValue).argParser(fn);
      } else {
        argument.default(fn);
      }
      this.addArgument(argument);
      return this;
    }
    arguments(names) {
      names.trim().split(/ +/).forEach((detail) => {
        this.argument(detail);
      });
      return this;
    }
    addArgument(argument) {
      const previousArgument = this.registeredArguments.slice(-1)[0];
      if (previousArgument && previousArgument.variadic) {
        throw new Error(`only the last argument can be variadic '${previousArgument.name()}'`);
      }
      if (argument.required && argument.defaultValue !== undefined && argument.parseArg === undefined) {
        throw new Error(`a default value for a required argument is never used: '${argument.name()}'`);
      }
      this.registeredArguments.push(argument);
      return this;
    }
    helpCommand(enableOrNameAndArgs, description) {
      if (typeof enableOrNameAndArgs === "boolean") {
        this._addImplicitHelpCommand = enableOrNameAndArgs;
        return this;
      }
      enableOrNameAndArgs = enableOrNameAndArgs ?? "help [command]";
      const [, helpName, helpArgs] = enableOrNameAndArgs.match(/([^ ]+) *(.*)/);
      const helpDescription = description ?? "display help for command";
      const helpCommand = this.createCommand(helpName);
      helpCommand.helpOption(false);
      if (helpArgs)
        helpCommand.arguments(helpArgs);
      if (helpDescription)
        helpCommand.description(helpDescription);
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    addHelpCommand(helpCommand, deprecatedDescription) {
      if (typeof helpCommand !== "object") {
        this.helpCommand(helpCommand, deprecatedDescription);
        return this;
      }
      this._addImplicitHelpCommand = true;
      this._helpCommand = helpCommand;
      return this;
    }
    _getHelpCommand() {
      const hasImplicitHelpCommand = this._addImplicitHelpCommand ?? (this.commands.length && !this._actionHandler && !this._findCommand("help"));
      if (hasImplicitHelpCommand) {
        if (this._helpCommand === undefined) {
          this.helpCommand(undefined, undefined);
        }
        return this._helpCommand;
      }
      return null;
    }
    hook(event, listener) {
      const allowedValues = ["preSubcommand", "preAction", "postAction"];
      if (!allowedValues.includes(event)) {
        throw new Error(`Unexpected value for event passed to hook : '${event}'.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      if (this._lifeCycleHooks[event]) {
        this._lifeCycleHooks[event].push(listener);
      } else {
        this._lifeCycleHooks[event] = [listener];
      }
      return this;
    }
    exitOverride(fn) {
      if (fn) {
        this._exitCallback = fn;
      } else {
        this._exitCallback = (err) => {
          if (err.code !== "commander.executeSubCommandAsync") {
            throw err;
          } else {}
        };
      }
      return this;
    }
    _exit(exitCode, code, message) {
      if (this._exitCallback) {
        this._exitCallback(new CommanderError(exitCode, code, message));
      }
      process2.exit(exitCode);
    }
    action(fn) {
      const listener = (args) => {
        const expectedArgsCount = this.registeredArguments.length;
        const actionArgs = args.slice(0, expectedArgsCount);
        if (this._storeOptionsAsProperties) {
          actionArgs[expectedArgsCount] = this;
        } else {
          actionArgs[expectedArgsCount] = this.opts();
        }
        actionArgs.push(this);
        return fn.apply(this, actionArgs);
      };
      this._actionHandler = listener;
      return this;
    }
    createOption(flags, description) {
      return new Option(flags, description);
    }
    _callParseArg(target, value, previous, invalidArgumentMessage) {
      try {
        return target.parseArg(value, previous);
      } catch (err) {
        if (err.code === "commander.invalidArgument") {
          const message = `${invalidArgumentMessage} ${err.message}`;
          this.error(message, { exitCode: err.exitCode, code: err.code });
        }
        throw err;
      }
    }
    _registerOption(option) {
      const matchingOption = option.short && this._findOption(option.short) || option.long && this._findOption(option.long);
      if (matchingOption) {
        const matchingFlag = option.long && this._findOption(option.long) ? option.long : option.short;
        throw new Error(`Cannot add option '${option.flags}'${this._name && ` to command '${this._name}'`} due to conflicting flag '${matchingFlag}'
-  already used by option '${matchingOption.flags}'`);
      }
      this.options.push(option);
    }
    _registerCommand(command) {
      const knownBy = (cmd) => {
        return [cmd.name()].concat(cmd.aliases());
      };
      const alreadyUsed = knownBy(command).find((name) => this._findCommand(name));
      if (alreadyUsed) {
        const existingCmd = knownBy(this._findCommand(alreadyUsed)).join("|");
        const newCmd = knownBy(command).join("|");
        throw new Error(`cannot add command '${newCmd}' as already have command '${existingCmd}'`);
      }
      this.commands.push(command);
    }
    addOption(option) {
      this._registerOption(option);
      const oname = option.name();
      const name = option.attributeName();
      if (option.negate) {
        const positiveLongFlag = option.long.replace(/^--no-/, "--");
        if (!this._findOption(positiveLongFlag)) {
          this.setOptionValueWithSource(name, option.defaultValue === undefined ? true : option.defaultValue, "default");
        }
      } else if (option.defaultValue !== undefined) {
        this.setOptionValueWithSource(name, option.defaultValue, "default");
      }
      const handleOptionValue = (val, invalidValueMessage, valueSource) => {
        if (val == null && option.presetArg !== undefined) {
          val = option.presetArg;
        }
        const oldValue = this.getOptionValue(name);
        if (val !== null && option.parseArg) {
          val = this._callParseArg(option, val, oldValue, invalidValueMessage);
        } else if (val !== null && option.variadic) {
          val = option._concatValue(val, oldValue);
        }
        if (val == null) {
          if (option.negate) {
            val = false;
          } else if (option.isBoolean() || option.optional) {
            val = true;
          } else {
            val = "";
          }
        }
        this.setOptionValueWithSource(name, val, valueSource);
      };
      this.on("option:" + oname, (val) => {
        const invalidValueMessage = `error: option '${option.flags}' argument '${val}' is invalid.`;
        handleOptionValue(val, invalidValueMessage, "cli");
      });
      if (option.envVar) {
        this.on("optionEnv:" + oname, (val) => {
          const invalidValueMessage = `error: option '${option.flags}' value '${val}' from env '${option.envVar}' is invalid.`;
          handleOptionValue(val, invalidValueMessage, "env");
        });
      }
      return this;
    }
    _optionEx(config, flags, description, fn, defaultValue) {
      if (typeof flags === "object" && flags instanceof Option) {
        throw new Error("To add an Option object use addOption() instead of option() or requiredOption()");
      }
      const option = this.createOption(flags, description);
      option.makeOptionMandatory(!!config.mandatory);
      if (typeof fn === "function") {
        option.default(defaultValue).argParser(fn);
      } else if (fn instanceof RegExp) {
        const regex = fn;
        fn = (val, def) => {
          const m = regex.exec(val);
          return m ? m[0] : def;
        };
        option.default(defaultValue).argParser(fn);
      } else {
        option.default(fn);
      }
      return this.addOption(option);
    }
    option(flags, description, parseArg, defaultValue) {
      return this._optionEx({}, flags, description, parseArg, defaultValue);
    }
    requiredOption(flags, description, parseArg, defaultValue) {
      return this._optionEx({ mandatory: true }, flags, description, parseArg, defaultValue);
    }
    combineFlagAndOptionalValue(combine = true) {
      this._combineFlagAndOptionalValue = !!combine;
      return this;
    }
    allowUnknownOption(allowUnknown = true) {
      this._allowUnknownOption = !!allowUnknown;
      return this;
    }
    allowExcessArguments(allowExcess = true) {
      this._allowExcessArguments = !!allowExcess;
      return this;
    }
    enablePositionalOptions(positional = true) {
      this._enablePositionalOptions = !!positional;
      return this;
    }
    passThroughOptions(passThrough = true) {
      this._passThroughOptions = !!passThrough;
      this._checkForBrokenPassThrough();
      return this;
    }
    _checkForBrokenPassThrough() {
      if (this.parent && this._passThroughOptions && !this.parent._enablePositionalOptions) {
        throw new Error(`passThroughOptions cannot be used for '${this._name}' without turning on enablePositionalOptions for parent command(s)`);
      }
    }
    storeOptionsAsProperties(storeAsProperties = true) {
      if (this.options.length) {
        throw new Error("call .storeOptionsAsProperties() before adding options");
      }
      if (Object.keys(this._optionValues).length) {
        throw new Error("call .storeOptionsAsProperties() before setting option values");
      }
      this._storeOptionsAsProperties = !!storeAsProperties;
      return this;
    }
    getOptionValue(key) {
      if (this._storeOptionsAsProperties) {
        return this[key];
      }
      return this._optionValues[key];
    }
    setOptionValue(key, value) {
      return this.setOptionValueWithSource(key, value, undefined);
    }
    setOptionValueWithSource(key, value, source) {
      if (this._storeOptionsAsProperties) {
        this[key] = value;
      } else {
        this._optionValues[key] = value;
      }
      this._optionValueSources[key] = source;
      return this;
    }
    getOptionValueSource(key) {
      return this._optionValueSources[key];
    }
    getOptionValueSourceWithGlobals(key) {
      let source;
      this._getCommandAndAncestors().forEach((cmd) => {
        if (cmd.getOptionValueSource(key) !== undefined) {
          source = cmd.getOptionValueSource(key);
        }
      });
      return source;
    }
    _prepareUserArgs(argv, parseOptions) {
      if (argv !== undefined && !Array.isArray(argv)) {
        throw new Error("first parameter to parse must be array or undefined");
      }
      parseOptions = parseOptions || {};
      if (argv === undefined && parseOptions.from === undefined) {
        if (process2.versions?.electron) {
          parseOptions.from = "electron";
        }
        const execArgv = process2.execArgv ?? [];
        if (execArgv.includes("-e") || execArgv.includes("--eval") || execArgv.includes("-p") || execArgv.includes("--print")) {
          parseOptions.from = "eval";
        }
      }
      if (argv === undefined) {
        argv = process2.argv;
      }
      this.rawArgs = argv.slice();
      let userArgs;
      switch (parseOptions.from) {
        case undefined:
        case "node":
          this._scriptPath = argv[1];
          userArgs = argv.slice(2);
          break;
        case "electron":
          if (process2.defaultApp) {
            this._scriptPath = argv[1];
            userArgs = argv.slice(2);
          } else {
            userArgs = argv.slice(1);
          }
          break;
        case "user":
          userArgs = argv.slice(0);
          break;
        case "eval":
          userArgs = argv.slice(1);
          break;
        default:
          throw new Error(`unexpected parse option { from: '${parseOptions.from}' }`);
      }
      if (!this._name && this._scriptPath)
        this.nameFromFilename(this._scriptPath);
      this._name = this._name || "program";
      return userArgs;
    }
    parse(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      this._parseCommand([], userArgs);
      return this;
    }
    async parseAsync(argv, parseOptions) {
      const userArgs = this._prepareUserArgs(argv, parseOptions);
      await this._parseCommand([], userArgs);
      return this;
    }
    _executeSubCommand(subcommand, args) {
      args = args.slice();
      let launchWithNode = false;
      const sourceExt = [".js", ".ts", ".tsx", ".mjs", ".cjs"];
      function findFile(baseDir, baseName) {
        const localBin = path.resolve(baseDir, baseName);
        if (fs.existsSync(localBin))
          return localBin;
        if (sourceExt.includes(path.extname(baseName)))
          return;
        const foundExt = sourceExt.find((ext) => fs.existsSync(`${localBin}${ext}`));
        if (foundExt)
          return `${localBin}${foundExt}`;
        return;
      }
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      let executableFile = subcommand._executableFile || `${this._name}-${subcommand._name}`;
      let executableDir = this._executableDir || "";
      if (this._scriptPath) {
        let resolvedScriptPath;
        try {
          resolvedScriptPath = fs.realpathSync(this._scriptPath);
        } catch (err) {
          resolvedScriptPath = this._scriptPath;
        }
        executableDir = path.resolve(path.dirname(resolvedScriptPath), executableDir);
      }
      if (executableDir) {
        let localFile = findFile(executableDir, executableFile);
        if (!localFile && !subcommand._executableFile && this._scriptPath) {
          const legacyName = path.basename(this._scriptPath, path.extname(this._scriptPath));
          if (legacyName !== this._name) {
            localFile = findFile(executableDir, `${legacyName}-${subcommand._name}`);
          }
        }
        executableFile = localFile || executableFile;
      }
      launchWithNode = sourceExt.includes(path.extname(executableFile));
      let proc;
      if (process2.platform !== "win32") {
        if (launchWithNode) {
          args.unshift(executableFile);
          args = incrementNodeInspectorPort(process2.execArgv).concat(args);
          proc = childProcess.spawn(process2.argv[0], args, { stdio: "inherit" });
        } else {
          proc = childProcess.spawn(executableFile, args, { stdio: "inherit" });
        }
      } else {
        args.unshift(executableFile);
        args = incrementNodeInspectorPort(process2.execArgv).concat(args);
        proc = childProcess.spawn(process2.execPath, args, { stdio: "inherit" });
      }
      if (!proc.killed) {
        const signals = ["SIGUSR1", "SIGUSR2", "SIGTERM", "SIGINT", "SIGHUP"];
        signals.forEach((signal) => {
          process2.on(signal, () => {
            if (proc.killed === false && proc.exitCode === null) {
              proc.kill(signal);
            }
          });
        });
      }
      const exitCallback = this._exitCallback;
      proc.on("close", (code) => {
        code = code ?? 1;
        if (!exitCallback) {
          process2.exit(code);
        } else {
          exitCallback(new CommanderError(code, "commander.executeSubCommandAsync", "(close)"));
        }
      });
      proc.on("error", (err) => {
        if (err.code === "ENOENT") {
          const executableDirMessage = executableDir ? `searched for local subcommand relative to directory '${executableDir}'` : "no directory for search for local subcommand, use .executableDir() to supply a custom directory";
          const executableMissing = `'${executableFile}' does not exist
 - if '${subcommand._name}' is not meant to be an executable command, remove description parameter from '.command()' and use '.description()' instead
 - if the default executable name is not suitable, use the executableFile option to supply a custom name or path
 - ${executableDirMessage}`;
          throw new Error(executableMissing);
        } else if (err.code === "EACCES") {
          throw new Error(`'${executableFile}' not executable`);
        }
        if (!exitCallback) {
          process2.exit(1);
        } else {
          const wrappedError = new CommanderError(1, "commander.executeSubCommandAsync", "(error)");
          wrappedError.nestedError = err;
          exitCallback(wrappedError);
        }
      });
      this.runningCommand = proc;
    }
    _dispatchSubcommand(commandName, operands, unknown) {
      const subCommand = this._findCommand(commandName);
      if (!subCommand)
        this.help({ error: true });
      let promiseChain;
      promiseChain = this._chainOrCallSubCommandHook(promiseChain, subCommand, "preSubcommand");
      promiseChain = this._chainOrCall(promiseChain, () => {
        if (subCommand._executableHandler) {
          this._executeSubCommand(subCommand, operands.concat(unknown));
        } else {
          return subCommand._parseCommand(operands, unknown);
        }
      });
      return promiseChain;
    }
    _dispatchHelpCommand(subcommandName) {
      if (!subcommandName) {
        this.help();
      }
      const subCommand = this._findCommand(subcommandName);
      if (subCommand && !subCommand._executableHandler) {
        subCommand.help();
      }
      return this._dispatchSubcommand(subcommandName, [], [this._getHelpOption()?.long ?? this._getHelpOption()?.short ?? "--help"]);
    }
    _checkNumberOfArguments() {
      this.registeredArguments.forEach((arg, i) => {
        if (arg.required && this.args[i] == null) {
          this.missingArgument(arg.name());
        }
      });
      if (this.registeredArguments.length > 0 && this.registeredArguments[this.registeredArguments.length - 1].variadic) {
        return;
      }
      if (this.args.length > this.registeredArguments.length) {
        this._excessArguments(this.args);
      }
    }
    _processArguments() {
      const myParseArg = (argument, value, previous) => {
        let parsedValue = value;
        if (value !== null && argument.parseArg) {
          const invalidValueMessage = `error: command-argument value '${value}' is invalid for argument '${argument.name()}'.`;
          parsedValue = this._callParseArg(argument, value, previous, invalidValueMessage);
        }
        return parsedValue;
      };
      this._checkNumberOfArguments();
      const processedArgs = [];
      this.registeredArguments.forEach((declaredArg, index) => {
        let value = declaredArg.defaultValue;
        if (declaredArg.variadic) {
          if (index < this.args.length) {
            value = this.args.slice(index);
            if (declaredArg.parseArg) {
              value = value.reduce((processed, v) => {
                return myParseArg(declaredArg, v, processed);
              }, declaredArg.defaultValue);
            }
          } else if (value === undefined) {
            value = [];
          }
        } else if (index < this.args.length) {
          value = this.args[index];
          if (declaredArg.parseArg) {
            value = myParseArg(declaredArg, value, declaredArg.defaultValue);
          }
        }
        processedArgs[index] = value;
      });
      this.processedArgs = processedArgs;
    }
    _chainOrCall(promise, fn) {
      if (promise && promise.then && typeof promise.then === "function") {
        return promise.then(() => fn());
      }
      return fn();
    }
    _chainOrCallHooks(promise, event) {
      let result = promise;
      const hooks = [];
      this._getCommandAndAncestors().reverse().filter((cmd) => cmd._lifeCycleHooks[event] !== undefined).forEach((hookedCommand) => {
        hookedCommand._lifeCycleHooks[event].forEach((callback) => {
          hooks.push({ hookedCommand, callback });
        });
      });
      if (event === "postAction") {
        hooks.reverse();
      }
      hooks.forEach((hookDetail) => {
        result = this._chainOrCall(result, () => {
          return hookDetail.callback(hookDetail.hookedCommand, this);
        });
      });
      return result;
    }
    _chainOrCallSubCommandHook(promise, subCommand, event) {
      let result = promise;
      if (this._lifeCycleHooks[event] !== undefined) {
        this._lifeCycleHooks[event].forEach((hook) => {
          result = this._chainOrCall(result, () => {
            return hook(this, subCommand);
          });
        });
      }
      return result;
    }
    _parseCommand(operands, unknown) {
      const parsed = this.parseOptions(unknown);
      this._parseOptionsEnv();
      this._parseOptionsImplied();
      operands = operands.concat(parsed.operands);
      unknown = parsed.unknown;
      this.args = operands.concat(unknown);
      if (operands && this._findCommand(operands[0])) {
        return this._dispatchSubcommand(operands[0], operands.slice(1), unknown);
      }
      if (this._getHelpCommand() && operands[0] === this._getHelpCommand().name()) {
        return this._dispatchHelpCommand(operands[1]);
      }
      if (this._defaultCommandName) {
        this._outputHelpIfRequested(unknown);
        return this._dispatchSubcommand(this._defaultCommandName, operands, unknown);
      }
      if (this.commands.length && this.args.length === 0 && !this._actionHandler && !this._defaultCommandName) {
        this.help({ error: true });
      }
      this._outputHelpIfRequested(parsed.unknown);
      this._checkForMissingMandatoryOptions();
      this._checkForConflictingOptions();
      const checkForUnknownOptions = () => {
        if (parsed.unknown.length > 0) {
          this.unknownOption(parsed.unknown[0]);
        }
      };
      const commandEvent = `command:${this.name()}`;
      if (this._actionHandler) {
        checkForUnknownOptions();
        this._processArguments();
        let promiseChain;
        promiseChain = this._chainOrCallHooks(promiseChain, "preAction");
        promiseChain = this._chainOrCall(promiseChain, () => this._actionHandler(this.processedArgs));
        if (this.parent) {
          promiseChain = this._chainOrCall(promiseChain, () => {
            this.parent.emit(commandEvent, operands, unknown);
          });
        }
        promiseChain = this._chainOrCallHooks(promiseChain, "postAction");
        return promiseChain;
      }
      if (this.parent && this.parent.listenerCount(commandEvent)) {
        checkForUnknownOptions();
        this._processArguments();
        this.parent.emit(commandEvent, operands, unknown);
      } else if (operands.length) {
        if (this._findCommand("*")) {
          return this._dispatchSubcommand("*", operands, unknown);
        }
        if (this.listenerCount("command:*")) {
          this.emit("command:*", operands, unknown);
        } else if (this.commands.length) {
          this.unknownCommand();
        } else {
          checkForUnknownOptions();
          this._processArguments();
        }
      } else if (this.commands.length) {
        checkForUnknownOptions();
        this.help({ error: true });
      } else {
        checkForUnknownOptions();
        this._processArguments();
      }
    }
    _findCommand(name) {
      if (!name)
        return;
      return this.commands.find((cmd) => cmd._name === name || cmd._aliases.includes(name));
    }
    _findOption(arg) {
      return this.options.find((option) => option.is(arg));
    }
    _checkForMissingMandatoryOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd.options.forEach((anOption) => {
          if (anOption.mandatory && cmd.getOptionValue(anOption.attributeName()) === undefined) {
            cmd.missingMandatoryOptionValue(anOption);
          }
        });
      });
    }
    _checkForConflictingLocalOptions() {
      const definedNonDefaultOptions = this.options.filter((option) => {
        const optionKey = option.attributeName();
        if (this.getOptionValue(optionKey) === undefined) {
          return false;
        }
        return this.getOptionValueSource(optionKey) !== "default";
      });
      const optionsWithConflicting = definedNonDefaultOptions.filter((option) => option.conflictsWith.length > 0);
      optionsWithConflicting.forEach((option) => {
        const conflictingAndDefined = definedNonDefaultOptions.find((defined) => option.conflictsWith.includes(defined.attributeName()));
        if (conflictingAndDefined) {
          this._conflictingOption(option, conflictingAndDefined);
        }
      });
    }
    _checkForConflictingOptions() {
      this._getCommandAndAncestors().forEach((cmd) => {
        cmd._checkForConflictingLocalOptions();
      });
    }
    parseOptions(argv) {
      const operands = [];
      const unknown = [];
      let dest = operands;
      const args = argv.slice();
      function maybeOption(arg) {
        return arg.length > 1 && arg[0] === "-";
      }
      let activeVariadicOption = null;
      while (args.length) {
        const arg = args.shift();
        if (arg === "--") {
          if (dest === unknown)
            dest.push(arg);
          dest.push(...args);
          break;
        }
        if (activeVariadicOption && !maybeOption(arg)) {
          this.emit(`option:${activeVariadicOption.name()}`, arg);
          continue;
        }
        activeVariadicOption = null;
        if (maybeOption(arg)) {
          const option = this._findOption(arg);
          if (option) {
            if (option.required) {
              const value = args.shift();
              if (value === undefined)
                this.optionMissingArgument(option);
              this.emit(`option:${option.name()}`, value);
            } else if (option.optional) {
              let value = null;
              if (args.length > 0 && !maybeOption(args[0])) {
                value = args.shift();
              }
              this.emit(`option:${option.name()}`, value);
            } else {
              this.emit(`option:${option.name()}`);
            }
            activeVariadicOption = option.variadic ? option : null;
            continue;
          }
        }
        if (arg.length > 2 && arg[0] === "-" && arg[1] !== "-") {
          const option = this._findOption(`-${arg[1]}`);
          if (option) {
            if (option.required || option.optional && this._combineFlagAndOptionalValue) {
              this.emit(`option:${option.name()}`, arg.slice(2));
            } else {
              this.emit(`option:${option.name()}`);
              args.unshift(`-${arg.slice(2)}`);
            }
            continue;
          }
        }
        if (/^--[^=]+=/.test(arg)) {
          const index = arg.indexOf("=");
          const option = this._findOption(arg.slice(0, index));
          if (option && (option.required || option.optional)) {
            this.emit(`option:${option.name()}`, arg.slice(index + 1));
            continue;
          }
        }
        if (maybeOption(arg)) {
          dest = unknown;
        }
        if ((this._enablePositionalOptions || this._passThroughOptions) && operands.length === 0 && unknown.length === 0) {
          if (this._findCommand(arg)) {
            operands.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          } else if (this._getHelpCommand() && arg === this._getHelpCommand().name()) {
            operands.push(arg);
            if (args.length > 0)
              operands.push(...args);
            break;
          } else if (this._defaultCommandName) {
            unknown.push(arg);
            if (args.length > 0)
              unknown.push(...args);
            break;
          }
        }
        if (this._passThroughOptions) {
          dest.push(arg);
          if (args.length > 0)
            dest.push(...args);
          break;
        }
        dest.push(arg);
      }
      return { operands, unknown };
    }
    opts() {
      if (this._storeOptionsAsProperties) {
        const result = {};
        const len = this.options.length;
        for (let i = 0;i < len; i++) {
          const key = this.options[i].attributeName();
          result[key] = key === this._versionOptionName ? this._version : this[key];
        }
        return result;
      }
      return this._optionValues;
    }
    optsWithGlobals() {
      return this._getCommandAndAncestors().reduce((combinedOptions, cmd) => Object.assign(combinedOptions, cmd.opts()), {});
    }
    error(message, errorOptions) {
      this._outputConfiguration.outputError(`${message}
`, this._outputConfiguration.writeErr);
      if (typeof this._showHelpAfterError === "string") {
        this._outputConfiguration.writeErr(`${this._showHelpAfterError}
`);
      } else if (this._showHelpAfterError) {
        this._outputConfiguration.writeErr(`
`);
        this.outputHelp({ error: true });
      }
      const config = errorOptions || {};
      const exitCode = config.exitCode || 1;
      const code = config.code || "commander.error";
      this._exit(exitCode, code, message);
    }
    _parseOptionsEnv() {
      this.options.forEach((option) => {
        if (option.envVar && option.envVar in process2.env) {
          const optionKey = option.attributeName();
          if (this.getOptionValue(optionKey) === undefined || ["default", "config", "env"].includes(this.getOptionValueSource(optionKey))) {
            if (option.required || option.optional) {
              this.emit(`optionEnv:${option.name()}`, process2.env[option.envVar]);
            } else {
              this.emit(`optionEnv:${option.name()}`);
            }
          }
        }
      });
    }
    _parseOptionsImplied() {
      const dualHelper = new DualOptions(this.options);
      const hasCustomOptionValue = (optionKey) => {
        return this.getOptionValue(optionKey) !== undefined && !["default", "implied"].includes(this.getOptionValueSource(optionKey));
      };
      this.options.filter((option) => option.implied !== undefined && hasCustomOptionValue(option.attributeName()) && dualHelper.valueFromOption(this.getOptionValue(option.attributeName()), option)).forEach((option) => {
        Object.keys(option.implied).filter((impliedKey) => !hasCustomOptionValue(impliedKey)).forEach((impliedKey) => {
          this.setOptionValueWithSource(impliedKey, option.implied[impliedKey], "implied");
        });
      });
    }
    missingArgument(name) {
      const message = `error: missing required argument '${name}'`;
      this.error(message, { code: "commander.missingArgument" });
    }
    optionMissingArgument(option) {
      const message = `error: option '${option.flags}' argument missing`;
      this.error(message, { code: "commander.optionMissingArgument" });
    }
    missingMandatoryOptionValue(option) {
      const message = `error: required option '${option.flags}' not specified`;
      this.error(message, { code: "commander.missingMandatoryOptionValue" });
    }
    _conflictingOption(option, conflictingOption) {
      const findBestOptionFromValue = (option2) => {
        const optionKey = option2.attributeName();
        const optionValue = this.getOptionValue(optionKey);
        const negativeOption = this.options.find((target) => target.negate && optionKey === target.attributeName());
        const positiveOption = this.options.find((target) => !target.negate && optionKey === target.attributeName());
        if (negativeOption && (negativeOption.presetArg === undefined && optionValue === false || negativeOption.presetArg !== undefined && optionValue === negativeOption.presetArg)) {
          return negativeOption;
        }
        return positiveOption || option2;
      };
      const getErrorMessage = (option2) => {
        const bestOption = findBestOptionFromValue(option2);
        const optionKey = bestOption.attributeName();
        const source = this.getOptionValueSource(optionKey);
        if (source === "env") {
          return `environment variable '${bestOption.envVar}'`;
        }
        return `option '${bestOption.flags}'`;
      };
      const message = `error: ${getErrorMessage(option)} cannot be used with ${getErrorMessage(conflictingOption)}`;
      this.error(message, { code: "commander.conflictingOption" });
    }
    unknownOption(flag) {
      if (this._allowUnknownOption)
        return;
      let suggestion = "";
      if (flag.startsWith("--") && this._showSuggestionAfterError) {
        let candidateFlags = [];
        let command = this;
        do {
          const moreFlags = command.createHelp().visibleOptions(command).filter((option) => option.long).map((option) => option.long);
          candidateFlags = candidateFlags.concat(moreFlags);
          command = command.parent;
        } while (command && !command._enablePositionalOptions);
        suggestion = suggestSimilar(flag, candidateFlags);
      }
      const message = `error: unknown option '${flag}'${suggestion}`;
      this.error(message, { code: "commander.unknownOption" });
    }
    _excessArguments(receivedArgs) {
      if (this._allowExcessArguments)
        return;
      const expected = this.registeredArguments.length;
      const s = expected === 1 ? "" : "s";
      const forSubcommand = this.parent ? ` for '${this.name()}'` : "";
      const message = `error: too many arguments${forSubcommand}. Expected ${expected} argument${s} but got ${receivedArgs.length}.`;
      this.error(message, { code: "commander.excessArguments" });
    }
    unknownCommand() {
      const unknownName = this.args[0];
      let suggestion = "";
      if (this._showSuggestionAfterError) {
        const candidateNames = [];
        this.createHelp().visibleCommands(this).forEach((command) => {
          candidateNames.push(command.name());
          if (command.alias())
            candidateNames.push(command.alias());
        });
        suggestion = suggestSimilar(unknownName, candidateNames);
      }
      const message = `error: unknown command '${unknownName}'${suggestion}`;
      this.error(message, { code: "commander.unknownCommand" });
    }
    version(str, flags, description) {
      if (str === undefined)
        return this._version;
      this._version = str;
      flags = flags || "-V, --version";
      description = description || "output the version number";
      const versionOption = this.createOption(flags, description);
      this._versionOptionName = versionOption.attributeName();
      this._registerOption(versionOption);
      this.on("option:" + versionOption.name(), () => {
        this._outputConfiguration.writeOut(`${str}
`);
        this._exit(0, "commander.version", str);
      });
      return this;
    }
    description(str, argsDescription) {
      if (str === undefined && argsDescription === undefined)
        return this._description;
      this._description = str;
      if (argsDescription) {
        this._argsDescription = argsDescription;
      }
      return this;
    }
    summary(str) {
      if (str === undefined)
        return this._summary;
      this._summary = str;
      return this;
    }
    alias(alias) {
      if (alias === undefined)
        return this._aliases[0];
      let command = this;
      if (this.commands.length !== 0 && this.commands[this.commands.length - 1]._executableHandler) {
        command = this.commands[this.commands.length - 1];
      }
      if (alias === command._name)
        throw new Error("Command alias can't be the same as its name");
      const matchingCommand = this.parent?._findCommand(alias);
      if (matchingCommand) {
        const existingCmd = [matchingCommand.name()].concat(matchingCommand.aliases()).join("|");
        throw new Error(`cannot add alias '${alias}' to command '${this.name()}' as already have command '${existingCmd}'`);
      }
      command._aliases.push(alias);
      return this;
    }
    aliases(aliases) {
      if (aliases === undefined)
        return this._aliases;
      aliases.forEach((alias) => this.alias(alias));
      return this;
    }
    usage(str) {
      if (str === undefined) {
        if (this._usage)
          return this._usage;
        const args = this.registeredArguments.map((arg) => {
          return humanReadableArgName(arg);
        });
        return [].concat(this.options.length || this._helpOption !== null ? "[options]" : [], this.commands.length ? "[command]" : [], this.registeredArguments.length ? args : []).join(" ");
      }
      this._usage = str;
      return this;
    }
    name(str) {
      if (str === undefined)
        return this._name;
      this._name = str;
      return this;
    }
    nameFromFilename(filename) {
      this._name = path.basename(filename, path.extname(filename));
      return this;
    }
    executableDir(path2) {
      if (path2 === undefined)
        return this._executableDir;
      this._executableDir = path2;
      return this;
    }
    helpInformation(contextOptions) {
      const helper = this.createHelp();
      if (helper.helpWidth === undefined) {
        helper.helpWidth = contextOptions && contextOptions.error ? this._outputConfiguration.getErrHelpWidth() : this._outputConfiguration.getOutHelpWidth();
      }
      return helper.formatHelp(this, helper);
    }
    _getHelpContext(contextOptions) {
      contextOptions = contextOptions || {};
      const context = { error: !!contextOptions.error };
      let write;
      if (context.error) {
        write = (arg) => this._outputConfiguration.writeErr(arg);
      } else {
        write = (arg) => this._outputConfiguration.writeOut(arg);
      }
      context.write = contextOptions.write || write;
      context.command = this;
      return context;
    }
    outputHelp(contextOptions) {
      let deprecatedCallback;
      if (typeof contextOptions === "function") {
        deprecatedCallback = contextOptions;
        contextOptions = undefined;
      }
      const context = this._getHelpContext(contextOptions);
      this._getCommandAndAncestors().reverse().forEach((command) => command.emit("beforeAllHelp", context));
      this.emit("beforeHelp", context);
      let helpInformation = this.helpInformation(context);
      if (deprecatedCallback) {
        helpInformation = deprecatedCallback(helpInformation);
        if (typeof helpInformation !== "string" && !Buffer.isBuffer(helpInformation)) {
          throw new Error("outputHelp callback must return a string or a Buffer");
        }
      }
      context.write(helpInformation);
      if (this._getHelpOption()?.long) {
        this.emit(this._getHelpOption().long);
      }
      this.emit("afterHelp", context);
      this._getCommandAndAncestors().forEach((command) => command.emit("afterAllHelp", context));
    }
    helpOption(flags, description) {
      if (typeof flags === "boolean") {
        if (flags) {
          this._helpOption = this._helpOption ?? undefined;
        } else {
          this._helpOption = null;
        }
        return this;
      }
      flags = flags ?? "-h, --help";
      description = description ?? "display help for command";
      this._helpOption = this.createOption(flags, description);
      return this;
    }
    _getHelpOption() {
      if (this._helpOption === undefined) {
        this.helpOption(undefined, undefined);
      }
      return this._helpOption;
    }
    addHelpOption(option) {
      this._helpOption = option;
      return this;
    }
    help(contextOptions) {
      this.outputHelp(contextOptions);
      let exitCode = process2.exitCode || 0;
      if (exitCode === 0 && contextOptions && typeof contextOptions !== "function" && contextOptions.error) {
        exitCode = 1;
      }
      this._exit(exitCode, "commander.help", "(outputHelp)");
    }
    addHelpText(position, text) {
      const allowedValues = ["beforeAll", "before", "after", "afterAll"];
      if (!allowedValues.includes(position)) {
        throw new Error(`Unexpected value for position to addHelpText.
Expecting one of '${allowedValues.join("', '")}'`);
      }
      const helpEvent = `${position}Help`;
      this.on(helpEvent, (context) => {
        let helpStr;
        if (typeof text === "function") {
          helpStr = text({ error: context.error, command: context.command });
        } else {
          helpStr = text;
        }
        if (helpStr) {
          context.write(`${helpStr}
`);
        }
      });
      return this;
    }
    _outputHelpIfRequested(args) {
      const helpOption = this._getHelpOption();
      const helpRequested = helpOption && args.find((arg) => helpOption.is(arg));
      if (helpRequested) {
        this.outputHelp();
        this._exit(0, "commander.helpDisplayed", "(outputHelp)");
      }
    }
  }
  function incrementNodeInspectorPort(args) {
    return args.map((arg) => {
      if (!arg.startsWith("--inspect")) {
        return arg;
      }
      let debugOption;
      let debugHost = "127.0.0.1";
      let debugPort = "9229";
      let match;
      if ((match = arg.match(/^(--inspect(-brk)?)$/)) !== null) {
        debugOption = match[1];
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+)$/)) !== null) {
        debugOption = match[1];
        if (/^\d+$/.test(match[3])) {
          debugPort = match[3];
        } else {
          debugHost = match[3];
        }
      } else if ((match = arg.match(/^(--inspect(-brk|-port)?)=([^:]+):(\d+)$/)) !== null) {
        debugOption = match[1];
        debugHost = match[3];
        debugPort = match[4];
      }
      if (debugOption && debugPort !== "0") {
        return `${debugOption}=${debugHost}:${parseInt(debugPort) + 1}`;
      }
      return arg;
    });
  }
  exports.Command = Command;
});

// node_modules/commander/index.js
var require_commander = __commonJS((exports) => {
  var { Argument } = require_argument();
  var { Command } = require_command();
  var { CommanderError, InvalidArgumentError } = require_error();
  var { Help } = require_help();
  var { Option } = require_option();
  exports.program = new Command;
  exports.createCommand = (name) => new Command(name);
  exports.createOption = (flags, description) => new Option(flags, description);
  exports.createArgument = (name, description) => new Argument(name, description);
  exports.Command = Command;
  exports.Option = Option;
  exports.Argument = Argument;
  exports.Help = Help;
  exports.CommanderError = CommanderError;
  exports.InvalidArgumentError = InvalidArgumentError;
  exports.InvalidOptionArgumentError = InvalidArgumentError;
});

// node_modules/commander/esm.mjs
var import__ = __toESM(require_commander(), 1);
var {
  program,
  createCommand,
  createArgument,
  createOption,
  CommanderError,
  InvalidArgumentError,
  InvalidOptionArgumentError,
  Command,
  Argument,
  Option,
  Help
} = import__.default;

// node_modules/chalk/source/vendor/ansi-styles/index.js
var ANSI_BACKGROUND_OFFSET = 10;
var wrapAnsi16 = (offset = 0) => (code) => `\x1B[${code + offset}m`;
var wrapAnsi256 = (offset = 0) => (code) => `\x1B[${38 + offset};5;${code}m`;
var wrapAnsi16m = (offset = 0) => (red, green, blue) => `\x1B[${38 + offset};2;${red};${green};${blue}m`;
var styles = {
  modifier: {
    reset: [0, 0],
    bold: [1, 22],
    dim: [2, 22],
    italic: [3, 23],
    underline: [4, 24],
    overline: [53, 55],
    inverse: [7, 27],
    hidden: [8, 28],
    strikethrough: [9, 29]
  },
  color: {
    black: [30, 39],
    red: [31, 39],
    green: [32, 39],
    yellow: [33, 39],
    blue: [34, 39],
    magenta: [35, 39],
    cyan: [36, 39],
    white: [37, 39],
    blackBright: [90, 39],
    gray: [90, 39],
    grey: [90, 39],
    redBright: [91, 39],
    greenBright: [92, 39],
    yellowBright: [93, 39],
    blueBright: [94, 39],
    magentaBright: [95, 39],
    cyanBright: [96, 39],
    whiteBright: [97, 39]
  },
  bgColor: {
    bgBlack: [40, 49],
    bgRed: [41, 49],
    bgGreen: [42, 49],
    bgYellow: [43, 49],
    bgBlue: [44, 49],
    bgMagenta: [45, 49],
    bgCyan: [46, 49],
    bgWhite: [47, 49],
    bgBlackBright: [100, 49],
    bgGray: [100, 49],
    bgGrey: [100, 49],
    bgRedBright: [101, 49],
    bgGreenBright: [102, 49],
    bgYellowBright: [103, 49],
    bgBlueBright: [104, 49],
    bgMagentaBright: [105, 49],
    bgCyanBright: [106, 49],
    bgWhiteBright: [107, 49]
  }
};
var modifierNames = Object.keys(styles.modifier);
var foregroundColorNames = Object.keys(styles.color);
var backgroundColorNames = Object.keys(styles.bgColor);
var colorNames = [...foregroundColorNames, ...backgroundColorNames];
function assembleStyles() {
  const codes = new Map;
  for (const [groupName, group] of Object.entries(styles)) {
    for (const [styleName, style] of Object.entries(group)) {
      styles[styleName] = {
        open: `\x1B[${style[0]}m`,
        close: `\x1B[${style[1]}m`
      };
      group[styleName] = styles[styleName];
      codes.set(style[0], style[1]);
    }
    Object.defineProperty(styles, groupName, {
      value: group,
      enumerable: false
    });
  }
  Object.defineProperty(styles, "codes", {
    value: codes,
    enumerable: false
  });
  styles.color.close = "\x1B[39m";
  styles.bgColor.close = "\x1B[49m";
  styles.color.ansi = wrapAnsi16();
  styles.color.ansi256 = wrapAnsi256();
  styles.color.ansi16m = wrapAnsi16m();
  styles.bgColor.ansi = wrapAnsi16(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi256 = wrapAnsi256(ANSI_BACKGROUND_OFFSET);
  styles.bgColor.ansi16m = wrapAnsi16m(ANSI_BACKGROUND_OFFSET);
  Object.defineProperties(styles, {
    rgbToAnsi256: {
      value(red, green, blue) {
        if (red === green && green === blue) {
          if (red < 8) {
            return 16;
          }
          if (red > 248) {
            return 231;
          }
          return Math.round((red - 8) / 247 * 24) + 232;
        }
        return 16 + 36 * Math.round(red / 255 * 5) + 6 * Math.round(green / 255 * 5) + Math.round(blue / 255 * 5);
      },
      enumerable: false
    },
    hexToRgb: {
      value(hex) {
        const matches = /[a-f\d]{6}|[a-f\d]{3}/i.exec(hex.toString(16));
        if (!matches) {
          return [0, 0, 0];
        }
        let [colorString] = matches;
        if (colorString.length === 3) {
          colorString = [...colorString].map((character) => character + character).join("");
        }
        const integer = Number.parseInt(colorString, 16);
        return [
          integer >> 16 & 255,
          integer >> 8 & 255,
          integer & 255
        ];
      },
      enumerable: false
    },
    hexToAnsi256: {
      value: (hex) => styles.rgbToAnsi256(...styles.hexToRgb(hex)),
      enumerable: false
    },
    ansi256ToAnsi: {
      value(code) {
        if (code < 8) {
          return 30 + code;
        }
        if (code < 16) {
          return 90 + (code - 8);
        }
        let red;
        let green;
        let blue;
        if (code >= 232) {
          red = ((code - 232) * 10 + 8) / 255;
          green = red;
          blue = red;
        } else {
          code -= 16;
          const remainder = code % 36;
          red = Math.floor(code / 36) / 5;
          green = Math.floor(remainder / 6) / 5;
          blue = remainder % 6 / 5;
        }
        const value = Math.max(red, green, blue) * 2;
        if (value === 0) {
          return 30;
        }
        let result = 30 + (Math.round(blue) << 2 | Math.round(green) << 1 | Math.round(red));
        if (value === 2) {
          result += 60;
        }
        return result;
      },
      enumerable: false
    },
    rgbToAnsi: {
      value: (red, green, blue) => styles.ansi256ToAnsi(styles.rgbToAnsi256(red, green, blue)),
      enumerable: false
    },
    hexToAnsi: {
      value: (hex) => styles.ansi256ToAnsi(styles.hexToAnsi256(hex)),
      enumerable: false
    }
  });
  return styles;
}
var ansiStyles = assembleStyles();
var ansi_styles_default = ansiStyles;

// node_modules/chalk/source/vendor/supports-color/index.js
import process2 from "process";
import os from "os";
import tty from "tty";
function hasFlag(flag, argv = globalThis.Deno ? globalThis.Deno.args : process2.argv) {
  const prefix = flag.startsWith("-") ? "" : flag.length === 1 ? "-" : "--";
  const position = argv.indexOf(prefix + flag);
  const terminatorPosition = argv.indexOf("--");
  return position !== -1 && (terminatorPosition === -1 || position < terminatorPosition);
}
var { env } = process2;
var flagForceColor;
if (hasFlag("no-color") || hasFlag("no-colors") || hasFlag("color=false") || hasFlag("color=never")) {
  flagForceColor = 0;
} else if (hasFlag("color") || hasFlag("colors") || hasFlag("color=true") || hasFlag("color=always")) {
  flagForceColor = 1;
}
function envForceColor() {
  if ("FORCE_COLOR" in env) {
    if (env.FORCE_COLOR === "true") {
      return 1;
    }
    if (env.FORCE_COLOR === "false") {
      return 0;
    }
    return env.FORCE_COLOR.length === 0 ? 1 : Math.min(Number.parseInt(env.FORCE_COLOR, 10), 3);
  }
}
function translateLevel(level) {
  if (level === 0) {
    return false;
  }
  return {
    level,
    hasBasic: true,
    has256: level >= 2,
    has16m: level >= 3
  };
}
function _supportsColor(haveStream, { streamIsTTY, sniffFlags = true } = {}) {
  const noFlagForceColor = envForceColor();
  if (noFlagForceColor !== undefined) {
    flagForceColor = noFlagForceColor;
  }
  const forceColor = sniffFlags ? flagForceColor : noFlagForceColor;
  if (forceColor === 0) {
    return 0;
  }
  if (sniffFlags) {
    if (hasFlag("color=16m") || hasFlag("color=full") || hasFlag("color=truecolor")) {
      return 3;
    }
    if (hasFlag("color=256")) {
      return 2;
    }
  }
  if ("TF_BUILD" in env && "AGENT_NAME" in env) {
    return 1;
  }
  if (haveStream && !streamIsTTY && forceColor === undefined) {
    return 0;
  }
  const min = forceColor || 0;
  if (env.TERM === "dumb") {
    return min;
  }
  if (process2.platform === "win32") {
    const osRelease = os.release().split(".");
    if (Number(osRelease[0]) >= 10 && Number(osRelease[2]) >= 10586) {
      return Number(osRelease[2]) >= 14931 ? 3 : 2;
    }
    return 1;
  }
  if ("CI" in env) {
    if (["GITHUB_ACTIONS", "GITEA_ACTIONS", "CIRCLECI"].some((key) => (key in env))) {
      return 3;
    }
    if (["TRAVIS", "APPVEYOR", "GITLAB_CI", "BUILDKITE", "DRONE"].some((sign) => (sign in env)) || env.CI_NAME === "codeship") {
      return 1;
    }
    return min;
  }
  if ("TEAMCITY_VERSION" in env) {
    return /^(9\.(0*[1-9]\d*)\.|\d{2,}\.)/.test(env.TEAMCITY_VERSION) ? 1 : 0;
  }
  if (env.COLORTERM === "truecolor") {
    return 3;
  }
  if (env.TERM === "xterm-kitty") {
    return 3;
  }
  if (env.TERM === "xterm-ghostty") {
    return 3;
  }
  if (env.TERM === "wezterm") {
    return 3;
  }
  if ("TERM_PROGRAM" in env) {
    const version = Number.parseInt((env.TERM_PROGRAM_VERSION || "").split(".")[0], 10);
    switch (env.TERM_PROGRAM) {
      case "iTerm.app": {
        return version >= 3 ? 3 : 2;
      }
      case "Apple_Terminal": {
        return 2;
      }
    }
  }
  if (/-256(color)?$/i.test(env.TERM)) {
    return 2;
  }
  if (/^screen|^xterm|^vt100|^vt220|^rxvt|color|ansi|cygwin|linux/i.test(env.TERM)) {
    return 1;
  }
  if ("COLORTERM" in env) {
    return 1;
  }
  return min;
}
function createSupportsColor(stream, options = {}) {
  const level = _supportsColor(stream, {
    streamIsTTY: stream && stream.isTTY,
    ...options
  });
  return translateLevel(level);
}
var supportsColor = {
  stdout: createSupportsColor({ isTTY: tty.isatty(1) }),
  stderr: createSupportsColor({ isTTY: tty.isatty(2) })
};
var supports_color_default = supportsColor;

// node_modules/chalk/source/utilities.js
function stringReplaceAll(string, substring, replacer) {
  let index = string.indexOf(substring);
  if (index === -1) {
    return string;
  }
  const substringLength = substring.length;
  let endIndex = 0;
  let returnValue = "";
  do {
    returnValue += string.slice(endIndex, index) + substring + replacer;
    endIndex = index + substringLength;
    index = string.indexOf(substring, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}
function stringEncaseCRLFWithFirstIndex(string, prefix, postfix, index) {
  let endIndex = 0;
  let returnValue = "";
  do {
    const gotCR = string[index - 1] === "\r";
    returnValue += string.slice(endIndex, gotCR ? index - 1 : index) + prefix + (gotCR ? `\r
` : `
`) + postfix;
    endIndex = index + 1;
    index = string.indexOf(`
`, endIndex);
  } while (index !== -1);
  returnValue += string.slice(endIndex);
  return returnValue;
}

// node_modules/chalk/source/index.js
var { stdout: stdoutColor, stderr: stderrColor } = supports_color_default;
var GENERATOR = Symbol("GENERATOR");
var STYLER = Symbol("STYLER");
var IS_EMPTY = Symbol("IS_EMPTY");
var levelMapping = [
  "ansi",
  "ansi",
  "ansi256",
  "ansi16m"
];
var styles2 = Object.create(null);
var applyOptions = (object, options = {}) => {
  if (options.level && !(Number.isInteger(options.level) && options.level >= 0 && options.level <= 3)) {
    throw new Error("The `level` option should be an integer from 0 to 3");
  }
  const colorLevel = stdoutColor ? stdoutColor.level : 0;
  object.level = options.level === undefined ? colorLevel : options.level;
};
var chalkFactory = (options) => {
  const chalk = (...strings) => strings.join(" ");
  applyOptions(chalk, options);
  Object.setPrototypeOf(chalk, createChalk.prototype);
  return chalk;
};
function createChalk(options) {
  return chalkFactory(options);
}
Object.setPrototypeOf(createChalk.prototype, Function.prototype);
for (const [styleName, style] of Object.entries(ansi_styles_default)) {
  styles2[styleName] = {
    get() {
      const builder = createBuilder(this, createStyler(style.open, style.close, this[STYLER]), this[IS_EMPTY]);
      Object.defineProperty(this, styleName, { value: builder });
      return builder;
    }
  };
}
styles2.visible = {
  get() {
    const builder = createBuilder(this, this[STYLER], true);
    Object.defineProperty(this, "visible", { value: builder });
    return builder;
  }
};
var getModelAnsi = (model, level, type, ...arguments_) => {
  if (model === "rgb") {
    if (level === "ansi16m") {
      return ansi_styles_default[type].ansi16m(...arguments_);
    }
    if (level === "ansi256") {
      return ansi_styles_default[type].ansi256(ansi_styles_default.rgbToAnsi256(...arguments_));
    }
    return ansi_styles_default[type].ansi(ansi_styles_default.rgbToAnsi(...arguments_));
  }
  if (model === "hex") {
    return getModelAnsi("rgb", level, type, ...ansi_styles_default.hexToRgb(...arguments_));
  }
  return ansi_styles_default[type][model](...arguments_);
};
var usedModels = ["rgb", "hex", "ansi256"];
for (const model of usedModels) {
  styles2[model] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "color", ...arguments_), ansi_styles_default.color.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
  const bgModel = "bg" + model[0].toUpperCase() + model.slice(1);
  styles2[bgModel] = {
    get() {
      const { level } = this;
      return function(...arguments_) {
        const styler = createStyler(getModelAnsi(model, levelMapping[level], "bgColor", ...arguments_), ansi_styles_default.bgColor.close, this[STYLER]);
        return createBuilder(this, styler, this[IS_EMPTY]);
      };
    }
  };
}
var proto = Object.defineProperties(() => {}, {
  ...styles2,
  level: {
    enumerable: true,
    get() {
      return this[GENERATOR].level;
    },
    set(level) {
      this[GENERATOR].level = level;
    }
  }
});
var createStyler = (open, close, parent) => {
  let openAll;
  let closeAll;
  if (parent === undefined) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }
  return {
    open,
    close,
    openAll,
    closeAll,
    parent
  };
};
var createBuilder = (self, _styler, _isEmpty) => {
  const builder = (...arguments_) => applyStyle(builder, arguments_.length === 1 ? "" + arguments_[0] : arguments_.join(" "));
  Object.setPrototypeOf(builder, proto);
  builder[GENERATOR] = self;
  builder[STYLER] = _styler;
  builder[IS_EMPTY] = _isEmpty;
  return builder;
};
var applyStyle = (self, string) => {
  if (self.level <= 0 || !string) {
    return self[IS_EMPTY] ? "" : string;
  }
  let styler = self[STYLER];
  if (styler === undefined) {
    return string;
  }
  const { openAll, closeAll } = styler;
  if (string.includes("\x1B")) {
    while (styler !== undefined) {
      string = stringReplaceAll(string, styler.close, styler.open);
      styler = styler.parent;
    }
  }
  const lfIndex = string.indexOf(`
`);
  if (lfIndex !== -1) {
    string = stringEncaseCRLFWithFirstIndex(string, closeAll, openAll, lfIndex);
  }
  return openAll + string + closeAll;
};
Object.defineProperties(createChalk.prototype, styles2);
var chalk = createChalk();
var chalkStderr = createChalk({ level: stderrColor ? stderrColor.level : 0 });
var source_default = chalk;

// node_modules/open/index.js
import process8 from "process";
import { Buffer as Buffer2 } from "buffer";
import path from "path";
import { fileURLToPath } from "url";
import { promisify as promisify5 } from "util";
import childProcess from "child_process";
import fs5, { constants as fsConstants2 } from "fs/promises";

// node_modules/wsl-utils/index.js
import process4 from "process";
import fs4, { constants as fsConstants } from "fs/promises";

// node_modules/is-wsl/index.js
import process3 from "process";
import os2 from "os";
import fs3 from "fs";

// node_modules/is-inside-container/index.js
import fs2 from "fs";

// node_modules/is-docker/index.js
import fs from "fs";
var isDockerCached;
function hasDockerEnv() {
  try {
    fs.statSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}
function hasDockerCGroup() {
  try {
    return fs.readFileSync("/proc/self/cgroup", "utf8").includes("docker");
  } catch {
    return false;
  }
}
function isDocker() {
  if (isDockerCached === undefined) {
    isDockerCached = hasDockerEnv() || hasDockerCGroup();
  }
  return isDockerCached;
}

// node_modules/is-inside-container/index.js
var cachedResult;
var hasContainerEnv = () => {
  try {
    fs2.statSync("/run/.containerenv");
    return true;
  } catch {
    return false;
  }
};
function isInsideContainer() {
  if (cachedResult === undefined) {
    cachedResult = hasContainerEnv() || isDocker();
  }
  return cachedResult;
}

// node_modules/is-wsl/index.js
var isWsl = () => {
  if (process3.platform !== "linux") {
    return false;
  }
  if (os2.release().toLowerCase().includes("microsoft")) {
    if (isInsideContainer()) {
      return false;
    }
    return true;
  }
  try {
    return fs3.readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft") ? !isInsideContainer() : false;
  } catch {
    return false;
  }
};
var is_wsl_default = process3.env.__IS_WSL_TEST__ ? isWsl : isWsl();

// node_modules/wsl-utils/index.js
var wslDrivesMountPoint = (() => {
  const defaultMountPoint = "/mnt/";
  let mountPoint;
  return async function() {
    if (mountPoint) {
      return mountPoint;
    }
    const configFilePath = "/etc/wsl.conf";
    let isConfigFileExists = false;
    try {
      await fs4.access(configFilePath, fsConstants.F_OK);
      isConfigFileExists = true;
    } catch {}
    if (!isConfigFileExists) {
      return defaultMountPoint;
    }
    const configContent = await fs4.readFile(configFilePath, { encoding: "utf8" });
    const configMountPoint = /(?<!#.*)root\s*=\s*(?<mountPoint>.*)/g.exec(configContent);
    if (!configMountPoint) {
      return defaultMountPoint;
    }
    mountPoint = configMountPoint.groups.mountPoint.trim();
    mountPoint = mountPoint.endsWith("/") ? mountPoint : `${mountPoint}/`;
    return mountPoint;
  };
})();
var powerShellPathFromWsl = async () => {
  const mountPoint = await wslDrivesMountPoint();
  return `${mountPoint}c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe`;
};
var powerShellPath = async () => {
  if (is_wsl_default) {
    return powerShellPathFromWsl();
  }
  return `${process4.env.SYSTEMROOT || process4.env.windir || String.raw`C:\Windows`}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
};

// node_modules/define-lazy-prop/index.js
function defineLazyProperty(object, propertyName, valueGetter) {
  const define = (value) => Object.defineProperty(object, propertyName, { value, enumerable: true, writable: true });
  Object.defineProperty(object, propertyName, {
    configurable: true,
    enumerable: true,
    get() {
      const result = valueGetter();
      define(result);
      return result;
    },
    set(value) {
      define(value);
    }
  });
  return object;
}

// node_modules/default-browser/index.js
import { promisify as promisify4 } from "util";
import process7 from "process";
import { execFile as execFile4 } from "child_process";

// node_modules/default-browser-id/index.js
import { promisify } from "util";
import process5 from "process";
import { execFile } from "child_process";
var execFileAsync = promisify(execFile);
async function defaultBrowserId() {
  if (process5.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const { stdout } = await execFileAsync("defaults", ["read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"]);
  const match = /LSHandlerRoleAll = "(?!-)(?<id>[^"]+?)";\s+?LSHandlerURLScheme = (?:http|https);/.exec(stdout);
  const browserId = match?.groups.id ?? "com.apple.Safari";
  if (browserId === "com.apple.safari") {
    return "com.apple.Safari";
  }
  return browserId;
}

// node_modules/run-applescript/index.js
import process6 from "process";
import { promisify as promisify2 } from "util";
import { execFile as execFile2, execFileSync } from "child_process";
var execFileAsync2 = promisify2(execFile2);
async function runAppleScript(script, { humanReadableOutput = true, signal } = {}) {
  if (process6.platform !== "darwin") {
    throw new Error("macOS only");
  }
  const outputArguments = humanReadableOutput ? [] : ["-ss"];
  const execOptions = {};
  if (signal) {
    execOptions.signal = signal;
  }
  const { stdout } = await execFileAsync2("osascript", ["-e", script, outputArguments], execOptions);
  return stdout.trim();
}

// node_modules/bundle-name/index.js
async function bundleName(bundleId) {
  return runAppleScript(`tell application "Finder" to set app_path to application file id "${bundleId}" as string
tell application "System Events" to get value of property list item "CFBundleName" of property list file (app_path & ":Contents:Info.plist")`);
}

// node_modules/default-browser/windows.js
import { promisify as promisify3 } from "util";
import { execFile as execFile3 } from "child_process";
var execFileAsync3 = promisify3(execFile3);
var windowsBrowserProgIds = {
  MSEdgeHTM: { name: "Edge", id: "com.microsoft.edge" },
  MSEdgeBHTML: { name: "Edge Beta", id: "com.microsoft.edge.beta" },
  MSEdgeDHTML: { name: "Edge Dev", id: "com.microsoft.edge.dev" },
  AppXq0fevzme2pys62n3e0fbqa7peapykr8v: { name: "Edge", id: "com.microsoft.edge.old" },
  ChromeHTML: { name: "Chrome", id: "com.google.chrome" },
  ChromeBHTML: { name: "Chrome Beta", id: "com.google.chrome.beta" },
  ChromeDHTML: { name: "Chrome Dev", id: "com.google.chrome.dev" },
  ChromiumHTM: { name: "Chromium", id: "org.chromium.Chromium" },
  BraveHTML: { name: "Brave", id: "com.brave.Browser" },
  BraveBHTML: { name: "Brave Beta", id: "com.brave.Browser.beta" },
  BraveDHTML: { name: "Brave Dev", id: "com.brave.Browser.dev" },
  BraveSSHTM: { name: "Brave Nightly", id: "com.brave.Browser.nightly" },
  FirefoxURL: { name: "Firefox", id: "org.mozilla.firefox" },
  OperaStable: { name: "Opera", id: "com.operasoftware.Opera" },
  VivaldiHTM: { name: "Vivaldi", id: "com.vivaldi.Vivaldi" },
  "IE.HTTP": { name: "Internet Explorer", id: "com.microsoft.ie" }
};
var _windowsBrowserProgIdMap = new Map(Object.entries(windowsBrowserProgIds));

class UnknownBrowserError extends Error {
}
async function defaultBrowser(_execFileAsync = execFileAsync3) {
  const { stdout } = await _execFileAsync("reg", [
    "QUERY",
    " HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\http\\UserChoice",
    "/v",
    "ProgId"
  ]);
  const match = /ProgId\s*REG_SZ\s*(?<id>\S+)/.exec(stdout);
  if (!match) {
    throw new UnknownBrowserError(`Cannot find Windows browser in stdout: ${JSON.stringify(stdout)}`);
  }
  const { id } = match.groups;
  const dotIndex = id.lastIndexOf(".");
  const hyphenIndex = id.lastIndexOf("-");
  const baseIdByDot = dotIndex === -1 ? undefined : id.slice(0, dotIndex);
  const baseIdByHyphen = hyphenIndex === -1 ? undefined : id.slice(0, hyphenIndex);
  return windowsBrowserProgIds[id] ?? windowsBrowserProgIds[baseIdByDot] ?? windowsBrowserProgIds[baseIdByHyphen] ?? { name: id, id };
}

// node_modules/default-browser/index.js
var execFileAsync4 = promisify4(execFile4);
var titleize = (string) => string.toLowerCase().replaceAll(/(?:^|\s|-)\S/g, (x) => x.toUpperCase());
async function defaultBrowser2() {
  if (process7.platform === "darwin") {
    const id = await defaultBrowserId();
    const name = await bundleName(id);
    return { name, id };
  }
  if (process7.platform === "linux") {
    const { stdout } = await execFileAsync4("xdg-mime", ["query", "default", "x-scheme-handler/http"]);
    const id = stdout.trim();
    const name = titleize(id.replace(/.desktop$/, "").replace("-", " "));
    return { name, id };
  }
  if (process7.platform === "win32") {
    return defaultBrowser();
  }
  throw new Error("Only macOS, Linux, and Windows are supported");
}

// node_modules/open/index.js
var execFile5 = promisify5(childProcess.execFile);
var __dirname2 = path.dirname(fileURLToPath(import.meta.url));
var localXdgOpenPath = path.join(__dirname2, "xdg-open");
var { platform, arch } = process8;
async function getWindowsDefaultBrowserFromWsl() {
  const powershellPath = await powerShellPath();
  const rawCommand = String.raw`(Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice").ProgId`;
  const encodedCommand = Buffer2.from(rawCommand, "utf16le").toString("base64");
  const { stdout } = await execFile5(powershellPath, [
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encodedCommand
  ], { encoding: "utf8" });
  const progId = stdout.trim();
  const browserMap = {
    ChromeHTML: "com.google.chrome",
    BraveHTML: "com.brave.Browser",
    MSEdgeHTM: "com.microsoft.edge",
    FirefoxURL: "org.mozilla.firefox"
  };
  return browserMap[progId] ? { id: browserMap[progId] } : {};
}
var pTryEach = async (array, mapper) => {
  let latestError;
  for (const item of array) {
    try {
      return await mapper(item);
    } catch (error) {
      latestError = error;
    }
  }
  throw latestError;
};
var baseOpen = async (options) => {
  options = {
    wait: false,
    background: false,
    newInstance: false,
    allowNonzeroExitCode: false,
    ...options
  };
  if (Array.isArray(options.app)) {
    return pTryEach(options.app, (singleApp) => baseOpen({
      ...options,
      app: singleApp
    }));
  }
  let { name: app, arguments: appArguments = [] } = options.app ?? {};
  appArguments = [...appArguments];
  if (Array.isArray(app)) {
    return pTryEach(app, (appName) => baseOpen({
      ...options,
      app: {
        name: appName,
        arguments: appArguments
      }
    }));
  }
  if (app === "browser" || app === "browserPrivate") {
    const ids = {
      "com.google.chrome": "chrome",
      "google-chrome.desktop": "chrome",
      "com.brave.Browser": "brave",
      "org.mozilla.firefox": "firefox",
      "firefox.desktop": "firefox",
      "com.microsoft.msedge": "edge",
      "com.microsoft.edge": "edge",
      "com.microsoft.edgemac": "edge",
      "microsoft-edge.desktop": "edge"
    };
    const flags = {
      chrome: "--incognito",
      brave: "--incognito",
      firefox: "--private-window",
      edge: "--inPrivate"
    };
    const browser = is_wsl_default ? await getWindowsDefaultBrowserFromWsl() : await defaultBrowser2();
    if (browser.id in ids) {
      const browserName = ids[browser.id];
      if (app === "browserPrivate") {
        appArguments.push(flags[browserName]);
      }
      return baseOpen({
        ...options,
        app: {
          name: apps[browserName],
          arguments: appArguments
        }
      });
    }
    throw new Error(`${browser.name} is not supported as a default browser`);
  }
  let command;
  const cliArguments = [];
  const childProcessOptions = {};
  if (platform === "darwin") {
    command = "open";
    if (options.wait) {
      cliArguments.push("--wait-apps");
    }
    if (options.background) {
      cliArguments.push("--background");
    }
    if (options.newInstance) {
      cliArguments.push("--new");
    }
    if (app) {
      cliArguments.push("-a", app);
    }
  } else if (platform === "win32" || is_wsl_default && !isInsideContainer() && !app) {
    command = await powerShellPath();
    cliArguments.push("-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand");
    if (!is_wsl_default) {
      childProcessOptions.windowsVerbatimArguments = true;
    }
    const encodedArguments = ["Start"];
    if (options.wait) {
      encodedArguments.push("-Wait");
    }
    if (app) {
      encodedArguments.push(`"\`"${app}\`""`);
      if (options.target) {
        appArguments.push(options.target);
      }
    } else if (options.target) {
      encodedArguments.push(`"${options.target}"`);
    }
    if (appArguments.length > 0) {
      appArguments = appArguments.map((argument) => `"\`"${argument}\`""`);
      encodedArguments.push("-ArgumentList", appArguments.join(","));
    }
    options.target = Buffer2.from(encodedArguments.join(" "), "utf16le").toString("base64");
  } else {
    if (app) {
      command = app;
    } else {
      const isBundled = !__dirname2 || __dirname2 === "/";
      let exeLocalXdgOpen = false;
      try {
        await fs5.access(localXdgOpenPath, fsConstants2.X_OK);
        exeLocalXdgOpen = true;
      } catch {}
      const useSystemXdgOpen = process8.versions.electron ?? (platform === "android" || isBundled || !exeLocalXdgOpen);
      command = useSystemXdgOpen ? "xdg-open" : localXdgOpenPath;
    }
    if (appArguments.length > 0) {
      cliArguments.push(...appArguments);
    }
    if (!options.wait) {
      childProcessOptions.stdio = "ignore";
      childProcessOptions.detached = true;
    }
  }
  if (platform === "darwin" && appArguments.length > 0) {
    cliArguments.push("--args", ...appArguments);
  }
  if (options.target) {
    cliArguments.push(options.target);
  }
  const subprocess = childProcess.spawn(command, cliArguments, childProcessOptions);
  if (options.wait) {
    return new Promise((resolve, reject) => {
      subprocess.once("error", reject);
      subprocess.once("close", (exitCode) => {
        if (!options.allowNonzeroExitCode && exitCode > 0) {
          reject(new Error(`Exited with code ${exitCode}`));
          return;
        }
        resolve(subprocess);
      });
    });
  }
  subprocess.unref();
  return subprocess;
};
var open = (target, options) => {
  if (typeof target !== "string") {
    throw new TypeError("Expected a `target`");
  }
  return baseOpen({
    ...options,
    target
  });
};
function detectArchBinary(binary) {
  if (typeof binary === "string" || Array.isArray(binary)) {
    return binary;
  }
  const { [arch]: archBinary } = binary;
  if (!archBinary) {
    throw new Error(`${arch} is not supported`);
  }
  return archBinary;
}
function detectPlatformBinary({ [platform]: platformBinary }, { wsl }) {
  if (wsl && is_wsl_default) {
    return detectArchBinary(wsl);
  }
  if (!platformBinary) {
    throw new Error(`${platform} is not supported`);
  }
  return detectArchBinary(platformBinary);
}
var apps = {};
defineLazyProperty(apps, "chrome", () => detectPlatformBinary({
  darwin: "google chrome",
  win32: "chrome",
  linux: ["google-chrome", "google-chrome-stable", "chromium"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    x64: ["/mnt/c/Program Files/Google/Chrome/Application/chrome.exe", "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"]
  }
}));
defineLazyProperty(apps, "brave", () => detectPlatformBinary({
  darwin: "brave browser",
  win32: "brave",
  linux: ["brave-browser", "brave"]
}, {
  wsl: {
    ia32: "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe",
    x64: ["/mnt/c/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe", "/mnt/c/Program Files (x86)/BraveSoftware/Brave-Browser/Application/brave.exe"]
  }
}));
defineLazyProperty(apps, "firefox", () => detectPlatformBinary({
  darwin: "firefox",
  win32: String.raw`C:\Program Files\Mozilla Firefox\firefox.exe`,
  linux: "firefox"
}, {
  wsl: "/mnt/c/Program Files/Mozilla Firefox/firefox.exe"
}));
defineLazyProperty(apps, "edge", () => detectPlatformBinary({
  darwin: "microsoft edge",
  win32: "msedge",
  linux: ["microsoft-edge", "microsoft-edge-dev"]
}, {
  wsl: "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
}));
defineLazyProperty(apps, "browser", () => "browser");
defineLazyProperty(apps, "browserPrivate", () => "browserPrivate");
var open_default = open;

// src/types/index.ts
class GmailApiError extends Error {
  statusCode;
  errors;
  constructor(message, statusCode, errors) {
    super(message);
    this.name = "GmailApiError";
    this.statusCode = statusCode;
    this.errors = errors;
  }
}

// src/utils/auth.ts
import { createServer } from "http";

// src/utils/config.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, renameSync, cpSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var DEFAULT_PROFILE = "default";
var CURRENT_PROFILE_FILE = "current_profile";
var PROFILES_DIR = "profiles";
var profileOverride;
function resolveBaseConfigDir() {
  return join(homedir(), ".connect", "connect-gmail");
}
var BASE_CONFIG_DIR = resolveBaseConfigDir();
function setProfileOverride(profile) {
  profileOverride = profile;
}
function ensureBaseConfigDir() {
  if (!existsSync(BASE_CONFIG_DIR)) {
    mkdirSync(BASE_CONFIG_DIR, { recursive: true });
  }
}
function getProfilesDir() {
  return join(BASE_CONFIG_DIR, PROFILES_DIR);
}
function getCurrentProfileFile() {
  return join(BASE_CONFIG_DIR, CURRENT_PROFILE_FILE);
}
function migrateToProfileStructure() {
  const profilesDir = getProfilesDir();
  const defaultProfileDir = join(profilesDir, DEFAULT_PROFILE);
  if (existsSync(profilesDir)) {
    return;
  }
  const oldConfigFile = join(BASE_CONFIG_DIR, "config.json");
  const oldTokensFile = join(BASE_CONFIG_DIR, "tokens.json");
  const oldSettingsFile = join(BASE_CONFIG_DIR, "settings.json");
  const oldContactsDir = join(BASE_CONFIG_DIR, "contacts");
  const hasOldStructure = existsSync(oldConfigFile) || existsSync(oldTokensFile) || existsSync(oldSettingsFile) || existsSync(oldContactsDir);
  if (!hasOldStructure) {
    mkdirSync(profilesDir, { recursive: true });
    return;
  }
  mkdirSync(defaultProfileDir, { recursive: true });
  if (existsSync(oldConfigFile)) {
    renameSync(oldConfigFile, join(defaultProfileDir, "config.json"));
  }
  if (existsSync(oldTokensFile)) {
    renameSync(oldTokensFile, join(defaultProfileDir, "tokens.json"));
  }
  if (existsSync(oldSettingsFile)) {
    renameSync(oldSettingsFile, join(defaultProfileDir, "settings.json"));
  }
  if (existsSync(oldContactsDir)) {
    cpSync(oldContactsDir, join(defaultProfileDir, "contacts"), { recursive: true });
    rmSync(oldContactsDir, { recursive: true });
  }
  writeFileSync(getCurrentProfileFile(), DEFAULT_PROFILE);
}
function getCurrentProfile() {
  if (profileOverride) {
    return profileOverride;
  }
  ensureBaseConfigDir();
  migrateToProfileStructure();
  const currentProfileFile = getCurrentProfileFile();
  if (existsSync(currentProfileFile)) {
    try {
      const profile = readFileSync(currentProfileFile, "utf-8").trim();
      if (profile && profileExists(profile)) {
        return profile;
      }
    } catch {}
  }
  return DEFAULT_PROFILE;
}
function setCurrentProfile(profile) {
  ensureBaseConfigDir();
  migrateToProfileStructure();
  if (!profileExists(profile)) {
    throw new Error(`Profile "${profile}" does not exist. Create it first with "profile create ${profile}"`);
  }
  writeFileSync(getCurrentProfileFile(), profile);
}
function profileExists(profile) {
  const profileDir = join(getProfilesDir(), profile);
  return existsSync(profileDir);
}
function listProfiles() {
  ensureBaseConfigDir();
  migrateToProfileStructure();
  const profilesDir = getProfilesDir();
  if (!existsSync(profilesDir)) {
    return [];
  }
  return readdirSync(profilesDir, { withFileTypes: true }).filter((dirent) => dirent.isDirectory()).map((dirent) => dirent.name).sort();
}
function createProfile(profile) {
  ensureBaseConfigDir();
  migrateToProfileStructure();
  if (profileExists(profile)) {
    throw new Error(`Profile "${profile}" already exists`);
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(profile)) {
    throw new Error("Profile name can only contain letters, numbers, hyphens, and underscores");
  }
  const profileDir = join(getProfilesDir(), profile);
  mkdirSync(profileDir, { recursive: true });
}
function deleteProfile(profile) {
  if (profile === DEFAULT_PROFILE) {
    throw new Error("Cannot delete the default profile");
  }
  if (!profileExists(profile)) {
    throw new Error(`Profile "${profile}" does not exist`);
  }
  const currentProfile = getCurrentProfile();
  if (currentProfile === profile) {
    setCurrentProfile(DEFAULT_PROFILE);
  }
  const profileDir = join(getProfilesDir(), profile);
  rmSync(profileDir, { recursive: true });
}
function resolveConfigDir() {
  ensureBaseConfigDir();
  migrateToProfileStructure();
  const profile = getCurrentProfile();
  const profileDir = join(getProfilesDir(), profile);
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }
  return profileDir;
}
function getConfigDirInternal() {
  return resolveConfigDir();
}
function getConfigDir() {
  return getConfigDirInternal();
}
function ensureConfigDir() {
  const configDir = getConfigDirInternal();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}
function getExportsDir() {
  return join(getConfigDirInternal(), "exports");
}
function ensureExportsDir() {
  const dir = getExportsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}
function loadConfig() {
  ensureConfigDir();
  const configFile = join(getConfigDirInternal(), "config.json");
  if (!existsSync(configFile)) {
    return {};
  }
  try {
    const content = readFileSync(configFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
function saveConfig(config) {
  ensureConfigDir();
  const configFile = join(getConfigDirInternal(), "config.json");
  writeFileSync(configFile, JSON.stringify(config, null, 2));
}
function loadBaseConfig() {
  ensureBaseConfigDir();
  const configFile = join(BASE_CONFIG_DIR, "credentials.json");
  if (!existsSync(configFile)) {
    const profiles = listProfiles();
    for (const profile of profiles) {
      const profileConfigFile = join(getProfilesDir(), profile, "config.json");
      if (existsSync(profileConfigFile)) {
        try {
          const content = readFileSync(profileConfigFile, "utf-8");
          const profileConfig = JSON.parse(content);
          if (profileConfig.clientId && profileConfig.clientSecret) {
            writeFileSync(configFile, JSON.stringify({
              clientId: profileConfig.clientId,
              clientSecret: profileConfig.clientSecret
            }, null, 2));
            return { clientId: profileConfig.clientId, clientSecret: profileConfig.clientSecret };
          }
        } catch {}
      }
    }
    return {};
  }
  try {
    const content = readFileSync(configFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return {};
  }
}
function saveBaseConfig(config) {
  ensureBaseConfigDir();
  const configFile = join(BASE_CONFIG_DIR, "credentials.json");
  writeFileSync(configFile, JSON.stringify(config, null, 2));
}
function getClientId() {
  return process.env.GMAIL_CLIENT_ID || loadBaseConfig().clientId;
}
function getClientSecret() {
  return process.env.GMAIL_CLIENT_SECRET || loadBaseConfig().clientSecret;
}
function setCredentials(clientId, clientSecret) {
  const config = loadBaseConfig();
  config.clientId = clientId;
  config.clientSecret = clientSecret;
  saveBaseConfig(config);
}
function loadTokens() {
  ensureConfigDir();
  const tokensFile = join(getConfigDirInternal(), "tokens.json");
  if (!existsSync(tokensFile)) {
    return null;
  }
  try {
    const content = readFileSync(tokensFile, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function saveTokens(tokens) {
  ensureConfigDir();
  const tokensFile = join(getConfigDirInternal(), "tokens.json");
  writeFileSync(tokensFile, JSON.stringify(tokens, null, 2), { mode: 384 });
}
function getUserEmail() {
  return loadConfig().userEmail;
}
function setUserEmail(email) {
  const config = loadConfig();
  config.userEmail = email;
  saveConfig(config);
}
function getUserName() {
  return loadConfig().userName;
}
function setUserName(name) {
  const config = loadConfig();
  config.userName = name;
  saveConfig(config);
}
function getFormattedSender() {
  const email = getUserEmail();
  const name = getUserName();
  if (!email) {
    throw new Error("User email not configured");
  }
  if (name) {
    return `"${name}" <${email}>`;
  }
  return email;
}
function clearTokens() {
  const tokensFile = join(getConfigDirInternal(), "tokens.json");
  if (existsSync(tokensFile)) {
    writeFileSync(tokensFile, "{}");
  }
}
function clearConfig() {
  saveConfig({});
  clearTokens();
}
function isAuthenticated() {
  const tokens = loadTokens();
  return tokens !== null && tokens.accessToken !== undefined && tokens.refreshToken !== undefined;
}

// src/utils/auth.ts
var GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
var GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
var GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  "https://mail.google.com/"
].join(" ");
var REDIRECT_PORT = 8089;
var REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}`;
function getAuthUrl() {
  const clientId = getClientId();
  if (!clientId) {
    throw new Error('Client ID not configured. Run "connect-gmail config set-credentials" first.');
  }
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: GMAIL_SCOPES,
    access_type: "offline",
    prompt: "consent"
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
async function exchangeCodeForTokens(code) {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("OAuth credentials not configured");
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code"
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Token exchange failed: ${response.status} ${response.statusText}`;
    try {
      const error = JSON.parse(errorText);
      errorMessage = `Token exchange failed: ${error.error_description || error.error || response.statusText}`;
      console.error("Token exchange error details:", error);
    } catch {
      errorMessage = `Token exchange failed: ${errorText || response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  const data = await response.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope
  };
  return tokens;
}
async function refreshAccessToken() {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const currentTokens = loadTokens();
  if (!clientId || !clientSecret) {
    throw new Error("OAuth credentials not configured");
  }
  if (!currentTokens?.refreshToken) {
    throw new Error("No refresh token available. Please login again.");
  }
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: currentTokens.refreshToken,
      grant_type: "refresh_token"
    })
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Token refresh failed: ${error.error_description || error.error}`);
  }
  const data = await response.json();
  const tokens = {
    accessToken: data.access_token,
    refreshToken: currentTokens.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
    tokenType: data.token_type,
    scope: data.scope || currentTokens.scope
  };
  saveTokens(tokens);
  return tokens;
}
function startCallbackServer() {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url || "", `http://127.0.0.1:${REDIRECT_PORT}`);
      if (url.pathname === "/" || url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const error = url.searchParams.get("error");
        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                  <h1 style="color: #dc3545;">Authentication Failed</h1>
                  <p>Error: ${error}</p>
                  <p>You can close this window.</p>
                </div>
              </body>
            </html>
          `);
          server.close();
          resolve({ success: false, error });
          return;
        }
        if (code) {
          try {
            const tokens = await exchangeCodeForTokens(code);
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <html>
                <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                  <div style="text-align: center;">
                    <h1 style="color: #28a745;">Authentication Successful!</h1>
                    <p>You can close this window and return to the terminal.</p>
                  </div>
                </body>
              </html>
            `);
            server.close();
            resolve({ success: true, tokens });
          } catch (err) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
              <html>
                <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                  <div style="text-align: center;">
                    <h1 style="color: #dc3545;">Authentication Failed</h1>
                    <p>Error: ${String(err)}</p>
                    <p>You can close this window.</p>
                  </div>
                </body>
              </html>
            `);
            server.close();
            resolve({ success: false, error: String(err) });
          }
        }
      }
    });
    server.listen(REDIRECT_PORT, () => {});
    setTimeout(() => {
      server.close();
      resolve({ success: false, error: "Authentication timed out" });
    }, 5 * 60 * 1000);
  });
}
async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('Not authenticated. Run "connect-gmail auth login" first.');
  }
  if (Date.now() >= tokens.expiresAt - 5 * 60 * 1000) {
    const newTokens = await refreshAccessToken();
    return newTokens.accessToken;
  }
  return tokens.accessToken;
}

// src/api/client.ts
var GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1";

class GmailClient {
  accessToken;
  userId = "me";
  constructor() {}
  setUserId(userId) {
    this.userId = userId;
  }
  getUserId() {
    return this.userId;
  }
  buildUrl(path2, params) {
    const url = new URL(`${GMAIL_API_BASE}${path2}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }
  async request(path2, options = {}) {
    const { method = "GET", params, body, headers = {} } = options;
    const accessToken = await getValidAccessToken();
    const url = this.buildUrl(path2, params);
    const requestHeaders = {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...headers
    };
    if (body && ["POST", "PUT", "PATCH"].includes(method)) {
      if (typeof body === "string") {
        requestHeaders["Content-Type"] = "message/rfc822";
      } else {
        requestHeaders["Content-Type"] = "application/json";
      }
    }
    const fetchOptions = {
      method,
      headers: requestHeaders
    };
    if (body && ["POST", "PUT", "PATCH"].includes(method)) {
      fetchOptions.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const response = await fetch(url, fetchOptions);
    if (response.status === 204) {
      return {};
    }
    let data;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const text = await response.text();
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
    } else {
      data = await response.text();
    }
    if (!response.ok) {
      const errorData = data;
      const errorMessage = errorData?.error?.message || String(data || response.statusText);
      throw new GmailApiError(errorMessage, response.status, errorData?.error?.errors);
    }
    return data;
  }
  async get(path2, params) {
    return this.request(path2, { method: "GET", params });
  }
  async post(path2, body, params) {
    return this.request(path2, { method: "POST", body, params });
  }
  async put(path2, body, params) {
    return this.request(path2, { method: "PUT", body, params });
  }
  async patch(path2, body, params) {
    return this.request(path2, { method: "PATCH", body, params });
  }
  async delete(path2, params) {
    return this.request(path2, { method: "DELETE", params });
  }
}

// src/utils/contacts.ts
import { existsSync as existsSync2, readFileSync as readFileSync2, writeFileSync as writeFileSync2, mkdirSync as mkdirSync2, readdirSync as readdirSync2, unlinkSync } from "fs";
import { join as join2 } from "path";
function getContactsDir() {
  const dir = join2(getConfigDir(), "contacts");
  if (!existsSync2(dir)) {
    mkdirSync2(dir, { recursive: true });
  }
  return dir;
}
function emailToFilename(email) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, "_") + ".json";
}
function saveContact(contact) {
  const contactsDir = getContactsDir();
  const filename = emailToFilename(contact.email);
  const filepath = join2(contactsDir, filename);
  const now = new Date().toISOString();
  const existing = getContact(contact.email);
  const data = {
    ...contact,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };
  writeFileSync2(filepath, JSON.stringify(data, null, 2));
}
function getContact(email) {
  const contactsDir = getContactsDir();
  const filename = emailToFilename(email);
  const filepath = join2(contactsDir, filename);
  if (!existsSync2(filepath)) {
    return null;
  }
  try {
    const content = readFileSync2(filepath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
function getAllContacts() {
  const contactsDir = getContactsDir();
  const files = readdirSync2(contactsDir).filter((f) => f.endsWith(".json"));
  const contacts = [];
  for (const file of files) {
    try {
      const content = readFileSync2(join2(contactsDir, file), "utf-8");
      contacts.push(JSON.parse(content));
    } catch {}
  }
  return contacts.sort((a, b) => a.email.localeCompare(b.email));
}
function deleteContact(email) {
  const contactsDir = getContactsDir();
  const filename = emailToFilename(email);
  const filepath = join2(contactsDir, filename);
  if (existsSync2(filepath)) {
    unlinkSync(filepath);
    return true;
  }
  return false;
}
function searchContacts(query) {
  const contacts = getAllContacts();
  const q = query.toLowerCase();
  return contacts.filter((c) => c.email.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q) || c.firstName?.toLowerCase().includes(q) || c.lastName?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q));
}
function formatEmailWithName(email, fallbackName) {
  const contact = getContact(email);
  let displayName = fallbackName;
  if (contact) {
    if (contact.name) {
      displayName = contact.name;
    } else if (contact.firstName || contact.lastName) {
      displayName = [contact.firstName, contact.lastName].filter(Boolean).join(" ");
    }
  }
  if (displayName) {
    return `"${displayName}" <${email}>`;
  }
  return email;
}

// src/utils/markdown.ts
function markdownToHtml(markdown) {
  let html = markdown;
  html = html.replace(/&(?!amp;|lt;|gt;|quot;|#)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/^(-{3,}|\*{3,}|_{3,})$/gm, "<hr>");
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/___(.+?)___/g, "<strong><em>$1</em></strong>");
  html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");
  html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");
  html = html.replace(/`([^`]+)`/g, '<code style="background:#f4f4f4;padding:2px 4px;border-radius:3px;">$1</code>');
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre style="background:#f4f4f4;padding:12px;border-radius:4px;overflow-x:auto;"><code>${code.trim()}</code></pre>`;
  });
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:#1a73e8;">$1</a>');
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;">');
  html = html.replace(/^> (.+)$/gm, '<blockquote style="border-left:4px solid #ddd;margin:0;padding-left:16px;color:#666;">$1</blockquote>');
  html = html.replace(/^[\*\-] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul style="margin:8px 0;">$&</ul>');
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  html = html.replace(/\n\n+/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/\n/g, "<br>");
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[1-6]>)/g, "$1");
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul)/g, "$1");
  html = html.replace(/(<\/ul>)<\/p>/g, "$1");
  html = html.replace(/<p>(<pre)/g, "$1");
  html = html.replace(/(<\/pre>)<\/p>/g, "$1");
  html = html.replace(/<p>(<blockquote)/g, "$1");
  html = html.replace(/(<\/blockquote>)<\/p>/g, "$1");
  html = html.replace(/<p><hr><\/p>/g, "<hr>");
  return html;
}
function wrapInEmailTemplate(html) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body>
${html}
</body>
</html>`;
}
function looksLikeMarkdown(text) {
  const markdownPatterns = [
    /^#{1,6} /m,
    /\*\*.+\*\*/,
    /\[.+\]\(.+\)/,
    /^[\*\-] /m,
    /^\d+\. /m,
    /```/,
    /^> /m
  ];
  return markdownPatterns.some((pattern) => pattern.test(text));
}

// src/utils/settings.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { join as join3 } from "path";
var DEFAULT_SETTINGS = {
  appendSignature: true,
  appendSignatureToReplies: false,
  markdownEnabled: true,
  defaultFormat: "pretty",
  defaultSendAsHtml: true
};
function getSettingsPath() {
  return join3(getConfigDir(), "settings.json");
}
function loadSettings() {
  ensureConfigDir();
  const filepath = getSettingsPath();
  if (!existsSync3(filepath)) {
    saveSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
  try {
    const content = readFileSync3(filepath, "utf-8");
    const loaded = JSON.parse(content);
    return { ...DEFAULT_SETTINGS, ...loaded };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
function saveSettings(settings) {
  ensureConfigDir();
  const filepath = getSettingsPath();
  writeFileSync3(filepath, JSON.stringify(settings, null, 2));
}
function setSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  saveSettings(settings);
}
function getSignature() {
  return loadSettings().signature;
}
function setSignature(signature) {
  setSetting("signature", signature);
}
function shouldAppendSignature(isReply = false) {
  const settings = loadSettings();
  if (isReply) {
    return settings.appendSignatureToReplies;
  }
  return settings.appendSignature;
}

// src/api/messages.ts
function encodeHeaderValue(value) {
  if (!/[^\x00-\x7F]/.test(value)) {
    return value;
  }
  const encoded = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}
function htmlToPlainText(html) {
  return html.replace(/<br\s*\/?>/gi, `
`).replace(/<\/p>/gi, `

`).replace(/<\/div>/gi, `
`).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, `

`).trim();
}

class MessagesApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async list(options = {}) {
    const params = {
      maxResults: options.maxResults || 10,
      pageToken: options.pageToken,
      q: options.q,
      includeSpamTrash: options.includeSpamTrash
    };
    if (options.labelIds && options.labelIds.length > 0) {
      params.labelIds = options.labelIds.join(",");
    }
    return this.client.get(`/users/${this.client.getUserId()}/messages`, params);
  }
  async get(messageId, format = "full") {
    return this.client.get(`/users/${this.client.getUserId()}/messages/${messageId}`, { format });
  }
  async send(options) {
    const message = this.buildRawMessage(options);
    const encodedMessage = Buffer.from(message).toString("base64url");
    const body = {
      raw: encodedMessage
    };
    if (options.threadId) {
      body.threadId = options.threadId;
    }
    return this.client.post(`/users/${this.client.getUserId()}/messages/send`, body);
  }
  async reply(messageId, options) {
    const original = await this.get(messageId, "full");
    const headers = original.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    const originalFrom = getHeader("From");
    const originalTo = getHeader("To");
    const originalSubject = getHeader("Subject");
    const originalMessageId = getHeader("Message-ID") || getHeader("Message-Id");
    const originalReferences = getHeader("References");
    const myEmail = getUserEmail();
    let replyTo = originalFrom;
    if (originalFrom.includes(myEmail || "")) {
      replyTo = originalTo;
    }
    let references = originalReferences ? `${originalReferences} ${originalMessageId}` : originalMessageId;
    let subject = originalSubject;
    if (!subject.toLowerCase().startsWith("re:")) {
      subject = `Re: ${subject}`;
    }
    const message = this.buildRawMessage({
      to: replyTo,
      cc: options.cc,
      bcc: options.bcc,
      subject,
      body: options.body,
      isHtml: options.isHtml,
      threadId: original.threadId,
      inReplyTo: originalMessageId,
      references,
      isReply: true
    });
    const encodedMessage = Buffer.from(message).toString("base64url");
    return this.client.post(`/users/${this.client.getUserId()}/messages/send`, {
      raw: encodedMessage,
      threadId: original.threadId
    });
  }
  async trash(messageId) {
    return this.client.post(`/users/${this.client.getUserId()}/messages/${messageId}/trash`);
  }
  async untrash(messageId) {
    return this.client.post(`/users/${this.client.getUserId()}/messages/${messageId}/untrash`);
  }
  async delete(messageId) {
    await this.client.delete(`/users/${this.client.getUserId()}/messages/${messageId}`);
  }
  async modify(messageId, addLabelIds, removeLabelIds) {
    return this.client.post(`/users/${this.client.getUserId()}/messages/${messageId}/modify`, {
      addLabelIds: addLabelIds || [],
      removeLabelIds: removeLabelIds || []
    });
  }
  async addLabel(messageId, labelId) {
    return this.modify(messageId, [labelId], undefined);
  }
  async removeLabel(messageId, labelId) {
    return this.modify(messageId, undefined, [labelId]);
  }
  async addLabels(messageId, labelIds) {
    return this.modify(messageId, labelIds, undefined);
  }
  async removeLabels(messageId, labelIds) {
    return this.modify(messageId, undefined, labelIds);
  }
  async markAsRead(messageId) {
    return this.modify(messageId, undefined, ["UNREAD"]);
  }
  async markAsUnread(messageId) {
    return this.modify(messageId, ["UNREAD"]);
  }
  async star(messageId) {
    return this.modify(messageId, ["STARRED"]);
  }
  async unstar(messageId) {
    return this.modify(messageId, undefined, ["STARRED"]);
  }
  async archive(messageId) {
    return this.modify(messageId, undefined, ["INBOX"]);
  }
  buildRawMessage(options) {
    const settings = loadSettings();
    const isReply = options.isReply || !!options.inReplyTo;
    const formatAddresses = (addresses) => {
      const addrs = Array.isArray(addresses) ? addresses : [addresses];
      return addrs.map((addr) => {
        if (addr.includes("<") && addr.includes(">")) {
          return addr;
        }
        return formatEmailWithName(addr);
      }).join(", ");
    };
    const to = formatAddresses(options.to);
    const cc = options.cc ? formatAddresses(options.cc) : "";
    const bcc = options.bcc ? formatAddresses(options.bcc) : "";
    let body = options.body;
    let isHtml = options.isHtml || false;
    if (settings.markdownEnabled && !isHtml && looksLikeMarkdown(body)) {
      body = markdownToHtml(body);
      isHtml = true;
    }
    if (shouldAppendSignature(isReply)) {
      const signature = getSignature();
      if (signature) {
        if (!isHtml) {
          body = body.replace(/\n/g, "<br>");
          isHtml = true;
        }
        body += `<br><br>${signature}`;
      }
    }
    let from;
    try {
      from = getFormattedSender();
    } catch {
      from = getUserEmail() || "";
    }
    let message = "";
    message += `From: ${from}\r
`;
    message += `To: ${to}\r
`;
    if (cc)
      message += `Cc: ${cc}\r
`;
    if (bcc)
      message += `Bcc: ${bcc}\r
`;
    message += `Subject: ${encodeHeaderValue(options.subject)}\r
`;
    if (options.inReplyTo) {
      message += `In-Reply-To: ${options.inReplyTo}\r
`;
    }
    if (options.references) {
      message += `References: ${options.references}\r
`;
    }
    message += `MIME-Version: 1.0\r
`;
    const mixedBoundary = `mixed_${Date.now()}`;
    const altBoundary = `alt_${Date.now()}`;
    if (options.attachments && options.attachments.length > 0) {
      message += `Content-Type: multipart/mixed; boundary="${mixedBoundary}"\r
\r
`;
      message += `--${mixedBoundary}\r
`;
      if (isHtml) {
        const htmlBody = wrapInEmailTemplate(body);
        const plainBody = htmlToPlainText(body);
        message += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r
\r
`;
        message += `--${altBoundary}\r
`;
        message += `Content-Type: text/plain; charset="UTF-8"\r
\r
`;
        message += `${plainBody}\r
`;
        message += `--${altBoundary}\r
`;
        message += `Content-Type: text/html; charset="UTF-8"\r
\r
`;
        message += `${htmlBody}\r
`;
        message += `--${altBoundary}--\r
`;
      } else {
        message += `Content-Type: text/plain; charset="UTF-8"\r
\r
`;
        message += `${body}\r
`;
      }
      for (const attachment of options.attachments) {
        message += `--${mixedBoundary}\r
`;
        message += `Content-Type: ${attachment.mimeType}; name="${attachment.filename}"\r
`;
        message += `Content-Disposition: attachment; filename="${attachment.filename}"\r
`;
        message += `Content-Transfer-Encoding: base64\r
\r
`;
        message += `${attachment.data}\r
`;
      }
      message += `--${mixedBoundary}--`;
    } else if (isHtml) {
      const htmlBody = wrapInEmailTemplate(body);
      const plainBody = htmlToPlainText(body);
      message += `Content-Type: multipart/alternative; boundary="${altBoundary}"\r
\r
`;
      message += `--${altBoundary}\r
`;
      message += `Content-Type: text/plain; charset="UTF-8"\r
\r
`;
      message += `${plainBody}\r
`;
      message += `--${altBoundary}\r
`;
      message += `Content-Type: text/html; charset="UTF-8"\r
\r
`;
      message += `${htmlBody}\r
`;
      message += `--${altBoundary}--`;
    } else {
      message += `Content-Type: text/plain; charset="UTF-8"\r
\r
`;
      message += body;
    }
    return message;
  }
  extractBody(message, preferHtml = false) {
    if (!message.payload)
      return "";
    const targetType = preferHtml ? "text/html" : "text/plain";
    const getBaseMime = (mimeType) => {
      if (!mimeType)
        return "";
      return mimeType.split(";")[0].trim().toLowerCase();
    };
    const collectTextParts = (part, results = []) => {
      if (part.body?.data && part.mimeType) {
        const baseMime = getBaseMime(part.mimeType);
        if (baseMime.startsWith("text/")) {
          results.push({
            mimeType: baseMime,
            data: Buffer.from(part.body.data, "base64url").toString("utf-8")
          });
        }
      }
      if (part.parts) {
        for (const p of part.parts) {
          collectTextParts(p, results);
        }
      }
      return results;
    };
    const textParts = collectTextParts(message.payload);
    const exactMatch = textParts.find((p) => p.mimeType === targetType);
    if (exactMatch) {
      return exactMatch.data;
    }
    const altMatch = textParts.find((p) => p.mimeType.startsWith("text/"));
    return altMatch?.data || "";
  }
  extractInlineImages(message) {
    if (!message.payload)
      return [];
    const images = [];
    const collectImages = (part) => {
      if (part.body?.data && part.mimeType?.startsWith("image/")) {
        const contentIdHeader = part.headers?.find((h) => h.name.toLowerCase() === "content-id");
        if (contentIdHeader) {
          const contentId = contentIdHeader.value.replace(/^<|>$/g, "");
          images.push({
            contentId,
            mimeType: part.mimeType,
            data: part.body.data
          });
        }
      }
      if (part.parts) {
        for (const p of part.parts) {
          collectImages(p);
        }
      }
    };
    collectImages(message.payload);
    return images;
  }
  getMessageStructure(message) {
    if (!message.payload)
      return {};
    const buildStructure = (part, depth = 0) => {
      const result = {
        mimeType: part.mimeType,
        size: part.body?.size || 0,
        hasData: !!part.body?.data,
        hasAttachmentId: !!part.body?.attachmentId
      };
      if (part.filename) {
        result.filename = part.filename;
      }
      const contentIdHeader = part.headers?.find((h) => h.name.toLowerCase() === "content-id");
      if (contentIdHeader) {
        result.contentId = contentIdHeader.value;
      }
      if (part.parts && part.parts.length > 0) {
        result.parts = part.parts.map((p) => buildStructure(p, depth + 1));
      }
      return result;
    };
    return buildStructure(message.payload);
  }
}

// src/api/labels.ts
class LabelsApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async list() {
    return this.client.get(`/users/${this.client.getUserId()}/labels`);
  }
  async get(labelId) {
    return this.client.get(`/users/${this.client.getUserId()}/labels/${labelId}`);
  }
  async create(options) {
    const body = {
      name: options.name
    };
    if (options.messageListVisibility) {
      body.messageListVisibility = options.messageListVisibility;
    }
    if (options.labelListVisibility) {
      body.labelListVisibility = options.labelListVisibility;
    }
    if (options.backgroundColor || options.textColor) {
      body.color = {
        backgroundColor: options.backgroundColor,
        textColor: options.textColor
      };
    }
    return this.client.post(`/users/${this.client.getUserId()}/labels`, body);
  }
  async update(labelId, options) {
    const body = {
      id: labelId
    };
    if (options.name) {
      body.name = options.name;
    }
    if (options.messageListVisibility) {
      body.messageListVisibility = options.messageListVisibility;
    }
    if (options.labelListVisibility) {
      body.labelListVisibility = options.labelListVisibility;
    }
    if (options.backgroundColor || options.textColor) {
      body.color = {
        backgroundColor: options.backgroundColor,
        textColor: options.textColor
      };
    }
    return this.client.patch(`/users/${this.client.getUserId()}/labels/${labelId}`, body);
  }
  async delete(labelId) {
    await this.client.delete(`/users/${this.client.getUserId()}/labels/${labelId}`);
  }
  async getByName(name) {
    const { labels } = await this.list();
    return labels.find((label) => label.name.toLowerCase() === name.toLowerCase());
  }
}

// src/api/threads.ts
class ThreadsApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async list(options = {}) {
    const params = {
      maxResults: options.maxResults || 10,
      pageToken: options.pageToken,
      q: options.q,
      includeSpamTrash: options.includeSpamTrash
    };
    if (options.labelIds && options.labelIds.length > 0) {
      params.labelIds = options.labelIds.join(",");
    }
    return this.client.get(`/users/${this.client.getUserId()}/threads`, params);
  }
  async get(threadId, format = "full") {
    return this.client.get(`/users/${this.client.getUserId()}/threads/${threadId}`, { format });
  }
  async trash(threadId) {
    return this.client.post(`/users/${this.client.getUserId()}/threads/${threadId}/trash`);
  }
  async untrash(threadId) {
    return this.client.post(`/users/${this.client.getUserId()}/threads/${threadId}/untrash`);
  }
  async delete(threadId) {
    await this.client.delete(`/users/${this.client.getUserId()}/threads/${threadId}`);
  }
  async modify(threadId, addLabelIds, removeLabelIds) {
    return this.client.post(`/users/${this.client.getUserId()}/threads/${threadId}/modify`, {
      addLabelIds: addLabelIds || [],
      removeLabelIds: removeLabelIds || []
    });
  }
}

// src/api/profile.ts
class ProfileApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async get() {
    return this.client.get(`/users/${this.client.getUserId()}/profile`);
  }
  async listSendAs() {
    return this.client.get(`/users/${this.client.getUserId()}/settings/sendAs`);
  }
  async getSendAs(sendAsEmail) {
    return this.client.get(`/users/${this.client.getUserId()}/settings/sendAs/${sendAsEmail}`);
  }
  async getPrimarySendAs() {
    const { sendAs } = await this.listSendAs();
    return sendAs.find((s) => s.isPrimary || s.isDefault);
  }
  async getSignature() {
    const primary = await this.getPrimarySendAs();
    return primary?.signature;
  }
  async getDisplayName() {
    const primary = await this.getPrimarySendAs();
    return primary?.displayName;
  }
}

// src/api/drafts.ts
function encodeHeaderValue2(value) {
  if (!/[^\x00-\x7F]/.test(value)) {
    return value;
  }
  const encoded = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${encoded}?=`;
}
function htmlToPlainText2(html) {
  return html.replace(/<br\s*\/?>/gi, `
`).replace(/<\/p>/gi, `

`).replace(/<\/div>/gi, `
`).replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, `

`).trim();
}

class DraftsApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async list(maxResults = 10) {
    return this.client.get(`/users/${this.client.getUserId()}/drafts`, { maxResults });
  }
  async get(draftId) {
    return this.client.get(`/users/${this.client.getUserId()}/drafts/${draftId}`);
  }
  async create(options) {
    const message = this.buildRawMessage(options);
    const encodedMessage = Buffer.from(message).toString("base64url");
    return this.client.post(`/users/${this.client.getUserId()}/drafts`, {
      message: {
        raw: encodedMessage
      }
    });
  }
  async update(draftId, options) {
    const message = this.buildRawMessage(options);
    const encodedMessage = Buffer.from(message).toString("base64url");
    return this.client.put(`/users/${this.client.getUserId()}/drafts/${draftId}`, {
      message: {
        raw: encodedMessage
      }
    });
  }
  async delete(draftId) {
    await this.client.delete(`/users/${this.client.getUserId()}/drafts/${draftId}`);
  }
  async send(draftId) {
    return this.client.post(`/users/${this.client.getUserId()}/drafts/send`, { id: draftId });
  }
  buildRawMessage(options) {
    const settings = loadSettings();
    const formatAddresses = (addresses) => {
      const addrs = Array.isArray(addresses) ? addresses : [addresses];
      return addrs.map((addr) => {
        if (addr.includes("<") && addr.includes(">")) {
          return addr;
        }
        return formatEmailWithName(addr);
      }).join(", ");
    };
    const to = formatAddresses(options.to);
    const cc = options.cc ? formatAddresses(options.cc) : "";
    const bcc = options.bcc ? formatAddresses(options.bcc) : "";
    let body = options.body;
    let isHtml = options.isHtml || false;
    if (settings.markdownEnabled && !isHtml && looksLikeMarkdown(body)) {
      body = markdownToHtml(body);
      isHtml = true;
    }
    if (shouldAppendSignature(false)) {
      const signature = getSignature();
      if (signature) {
        if (!isHtml) {
          body = body.replace(/\n/g, "<br>");
          isHtml = true;
        }
        body += `<br><br>${signature}`;
      }
    }
    let from;
    try {
      from = getFormattedSender();
    } catch {
      from = getUserEmail() || "";
    }
    let message = "";
    message += `From: ${from}\r
`;
    message += `To: ${to}\r
`;
    if (cc)
      message += `Cc: ${cc}\r
`;
    if (bcc)
      message += `Bcc: ${bcc}\r
`;
    message += `Subject: ${encodeHeaderValue2(options.subject)}\r
`;
    message += `MIME-Version: 1.0\r
`;
    if (isHtml) {
      const boundary = `boundary_${Date.now()}`;
      const htmlBody = wrapInEmailTemplate(body);
      const plainBody = htmlToPlainText2(body);
      message += `Content-Type: multipart/alternative; boundary="${boundary}"\r
\r
`;
      message += `--${boundary}\r
`;
      message += `Content-Type: text/plain; charset="UTF-8"\r
\r
`;
      message += `${plainBody}\r
`;
      message += `--${boundary}\r
`;
      message += `Content-Type: text/html; charset="UTF-8"\r
\r
`;
      message += `${htmlBody}\r
`;
      message += `--${boundary}--`;
    } else {
      message += `Content-Type: text/plain; charset="UTF-8"\r
\r
`;
      message += body;
    }
    return message;
  }
}

// src/api/filters.ts
class FiltersApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async list() {
    return this.client.get(`/users/${this.client.getUserId()}/settings/filters`);
  }
  async get(filterId) {
    return this.client.get(`/users/${this.client.getUserId()}/settings/filters/${filterId}`);
  }
  async create(options) {
    return this.client.post(`/users/${this.client.getUserId()}/settings/filters`, {
      criteria: options.criteria,
      action: this.buildAction(options.action)
    });
  }
  async delete(filterId) {
    await this.client.delete(`/users/${this.client.getUserId()}/settings/filters/${filterId}`);
  }
  buildAction(action) {
    const result = {};
    if (action.addLabelIds) {
      result.addLabelIds = action.addLabelIds;
    }
    if (action.removeLabelIds) {
      result.removeLabelIds = action.removeLabelIds;
    }
    if (action.forward) {
      result.forward = action.forward;
    }
    if (action.markImportant) {
      result.addLabelIds = [...result.addLabelIds || [], "IMPORTANT"];
    }
    if (action.neverMarkImportant) {
      result.removeLabelIds = [...result.removeLabelIds || [], "IMPORTANT"];
    }
    if (action.markRead) {
      result.removeLabelIds = [...result.removeLabelIds || [], "UNREAD"];
    }
    if (action.archive) {
      result.removeLabelIds = [...result.removeLabelIds || [], "INBOX"];
    }
    if (action.trash) {
      result.addLabelIds = [...result.addLabelIds || [], "TRASH"];
    }
    if (action.star) {
      result.addLabelIds = [...result.addLabelIds || [], "STARRED"];
    }
    if (action.neverSpam) {
      result.removeLabelIds = [...result.removeLabelIds || [], "SPAM"];
    }
    return result;
  }
}

// src/api/attachments.ts
import { existsSync as existsSync4, mkdirSync as mkdirSync3, writeFileSync as writeFileSync4 } from "fs";
import { join as join4 } from "path";
class AttachmentsApi {
  client;
  constructor(client) {
    this.client = client;
  }
  getAttachmentsDir(messageId) {
    const dir = join4(getConfigDir(), "attachments", messageId);
    if (!existsSync4(dir)) {
      mkdirSync3(dir, { recursive: true });
    }
    return dir;
  }
  extractAttachments(part, attachments = []) {
    if (part.body?.attachmentId && part.filename) {
      attachments.push({
        attachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size,
        partId: part.partId
      });
    }
    if (part.parts) {
      for (const subpart of part.parts) {
        this.extractAttachments(subpart, attachments);
      }
    }
    return attachments;
  }
  async list(messageId) {
    const message = await this.client.get(`/users/${this.client.getUserId()}/messages/${messageId}`, { format: "full" });
    if (!message.payload) {
      return [];
    }
    return this.extractAttachments(message.payload);
  }
  async get(messageId, attachmentId) {
    return this.client.get(`/users/${this.client.getUserId()}/messages/${messageId}/attachments/${attachmentId}`);
  }
  async download(messageId, attachmentId, filename, mimeType) {
    const data = await this.get(messageId, attachmentId);
    const dir = this.getAttachmentsDir(messageId);
    const filepath = join4(dir, filename);
    const buffer = Buffer.from(data.data, "base64url");
    writeFileSync4(filepath, buffer);
    return {
      filename,
      path: filepath,
      size: buffer.length,
      mimeType
    };
  }
  async downloadAll(messageId) {
    const attachments = await this.list(messageId);
    const downloaded = [];
    for (const attachment of attachments) {
      const result = await this.download(messageId, attachment.attachmentId, attachment.filename, attachment.mimeType);
      downloaded.push(result);
    }
    return downloaded;
  }
  getStoragePath(messageId) {
    return this.getAttachmentsDir(messageId);
  }
}

// src/api/export.ts
import { writeFileSync as writeFileSync5, mkdirSync as mkdirSync4, existsSync as existsSync5, appendFileSync } from "fs";
import { join as join5, dirname } from "path";
class ExportApi {
  client;
  constructor(client) {
    this.client = client;
  }
  async exportMessages(options = {}) {
    const format = options.format || "eml";
    const messages = await this.getMessages(options);
    if (messages.length === 0) {
      const outputDir = options.outputDir || ensureExportsDir();
      const filename = options.filename || `emails_${new Date().toISOString().split("T")[0]}.${format === "mbox" ? "mbox" : "eml"}`;
      const filePath = join5(outputDir, filename);
      writeFileSync5(filePath, "", "utf-8");
      return {
        messageCount: 0,
        filePath,
        format
      };
    }
    if (format === "mbox") {
      return this.exportToMbox(messages, options);
    } else {
      return this.exportToEml(messages, options);
    }
  }
  async exportLabel(labelId, options = {}) {
    return this.exportMessages({
      ...options,
      labelIds: [labelId]
    });
  }
  async exportInbox(options = {}) {
    return this.exportLabel("INBOX", options);
  }
  async exportSent(options = {}) {
    return this.exportLabel("SENT", options);
  }
  async exportStarred(options = {}) {
    return this.exportLabel("STARRED", options);
  }
  async exportMessage(messageId, options = {}) {
    const message = await this.client.get(`/users/${this.client.getUserId()}/messages/${messageId}`, { format: "raw" });
    const outputDir = options.outputDir || ensureExportsDir();
    const filename = options.filename || `message_${messageId}.eml`;
    const filePath = join5(outputDir, filename);
    if (!existsSync5(dirname(filePath))) {
      mkdirSync4(dirname(filePath), { recursive: true });
    }
    const rawContent = this.decodeBase64Url(message.raw || "");
    writeFileSync5(filePath, rawContent, "utf-8");
    return {
      messageCount: 1,
      filePath,
      format: "eml"
    };
  }
  async exportThread(threadId, options = {}) {
    const thread = await this.client.get(`/users/${this.client.getUserId()}/threads/${threadId}`, { format: "minimal" });
    const messageIds = thread.messages.map((m) => m.id);
    const messages = [];
    for (const id of messageIds) {
      const message = await this.client.get(`/users/${this.client.getUserId()}/messages/${id}`, { format: "raw" });
      messages.push(message);
    }
    const format = options.format || "mbox";
    if (format === "mbox") {
      return this.exportToMbox(messages, {
        ...options,
        filename: options.filename || `thread_${threadId}.mbox`
      });
    } else {
      return this.exportToEml(messages, {
        ...options,
        filename: options.filename || `thread_${threadId}`
      });
    }
  }
  async exportToEml(messages, options) {
    const outputDir = options.outputDir || ensureExportsDir();
    const timestamp = new Date().toISOString().split("T")[0];
    const exportDir = join5(outputDir, options.filename || `emails_${timestamp}`);
    if (!existsSync5(exportDir)) {
      mkdirSync4(exportDir, { recursive: true });
    }
    for (let i = 0;i < messages.length; i++) {
      const message = messages[i];
      const rawContent = this.decodeBase64Url(message.raw || "");
      const subjectMatch = rawContent.match(/^Subject:\s*(.+)$/m);
      let subject = subjectMatch ? subjectMatch[1].trim() : `message_${i + 1}`;
      subject = this.sanitizeFilename(subject).slice(0, 50);
      const filename = `${i + 1}_${message.id}_${subject}.eml`;
      const filePath = join5(exportDir, filename);
      writeFileSync5(filePath, rawContent, "utf-8");
    }
    return {
      messageCount: messages.length,
      filePath: exportDir,
      format: "eml"
    };
  }
  async exportToMbox(messages, options) {
    const outputDir = options.outputDir || ensureExportsDir();
    const filename = options.filename || `emails_${new Date().toISOString().split("T")[0]}.mbox`;
    const filePath = join5(outputDir, filename);
    if (!existsSync5(dirname(filePath))) {
      mkdirSync4(dirname(filePath), { recursive: true });
    }
    writeFileSync5(filePath, "", "utf-8");
    for (const message of messages) {
      const rawContent = this.decodeBase64Url(message.raw || "");
      const fromMatch = rawContent.match(/^From:\s*(.+)$/m);
      let fromAddr = "unknown@unknown.com";
      if (fromMatch) {
        const emailMatch = fromMatch[1].match(/<([^>]+)>/) || fromMatch[1].match(/([^\s<>]+@[^\s<>]+)/);
        if (emailMatch) {
          fromAddr = emailMatch[1];
        }
      }
      const dateMatch = rawContent.match(/^Date:\s*(.+)$/m);
      let mboxDate = new Date().toUTCString();
      if (dateMatch) {
        try {
          const parsed = new Date(dateMatch[1]);
          if (!isNaN(parsed.getTime())) {
            mboxDate = parsed.toUTCString().replace(/,/g, "").replace(/ GMT$/, "");
          }
        } catch {}
      }
      const mboxLine = `From ${fromAddr} ${mboxDate}
`;
      appendFileSync(filePath, mboxLine, "utf-8");
      const escapedContent = rawContent.replace(/^From /gm, ">From ");
      appendFileSync(filePath, escapedContent, "utf-8");
      if (!rawContent.endsWith(`
`)) {
        appendFileSync(filePath, `
`, "utf-8");
      }
      appendFileSync(filePath, `
`, "utf-8");
    }
    return {
      messageCount: messages.length,
      filePath,
      format: "mbox"
    };
  }
  async getMessages(options) {
    const messages = [];
    let pageToken;
    const maxResults = options.maxResults || 1000;
    let fetched = 0;
    do {
      const params = {
        maxResults: Math.min(100, maxResults - fetched),
        pageToken,
        q: options.query,
        includeSpamTrash: false
      };
      if (options.labelIds && options.labelIds.length > 0) {
        params.labelIds = options.labelIds.join(",");
      }
      const response = await this.client.get(`/users/${this.client.getUserId()}/messages`, params);
      if (!response.messages || response.messages.length === 0) {
        break;
      }
      for (const msg of response.messages) {
        if (fetched >= maxResults)
          break;
        const fullMessage = await this.client.get(`/users/${this.client.getUserId()}/messages/${msg.id}`, { format: "raw" });
        messages.push(fullMessage);
        fetched++;
      }
      pageToken = response.nextPageToken;
    } while (pageToken && fetched < maxResults);
    return messages;
  }
  decodeBase64Url(encoded) {
    let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) {
      base64 += "=";
    }
    return Buffer.from(base64, "base64").toString("utf-8");
  }
  sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "").replace(/\s+/g, "_").replace(/^\.+/, "").slice(0, 200);
  }
}

// src/api/bulk.ts
class BulkApi {
  client;
  messages;
  labels;
  constructor(client) {
    this.client = client;
    this.messages = new MessagesApi(client);
    this.labels = new LabelsApi(client);
  }
  async preview(query, maxResults = 50) {
    const messages = await this.fetchMessages(query, maxResults);
    return {
      messages,
      total: messages.length,
      query
    };
  }
  async modifyLabels(options) {
    const {
      query,
      maxResults = 100,
      concurrency = 10,
      dryRun = false,
      addLabelIds = [],
      removeLabelIds = [],
      addLabels = [],
      removeLabels = [],
      onProgress,
      onError
    } = options;
    const resolvedAddIds = [...addLabelIds];
    const resolvedRemoveIds = [...removeLabelIds];
    if (addLabels.length > 0 || removeLabels.length > 0) {
      const allLabels = await this.labels.list();
      const labelMap = new Map(allLabels.labels.map((l) => [l.name.toLowerCase(), l.id]));
      for (const name of addLabels) {
        const id = labelMap.get(name.toLowerCase());
        if (id)
          resolvedAddIds.push(id);
        else
          throw new Error(`Label not found: ${name}`);
      }
      for (const name of removeLabels) {
        const id = labelMap.get(name.toLowerCase());
        if (id)
          resolvedRemoveIds.push(id);
        else
          throw new Error(`Label not found: ${name}`);
      }
    }
    if (resolvedAddIds.length === 0 && resolvedRemoveIds.length === 0) {
      throw new Error("At least one label to add or remove is required");
    }
    const messages = await this.fetchMessages(query, maxResults);
    return this.executeBatch(messages, {
      dryRun,
      concurrency,
      onProgress,
      onError,
      operation: async (msg) => {
        await this.messages.modify(msg.id, resolvedAddIds, resolvedRemoveIds);
      }
    });
  }
  async addLabels(options) {
    return this.modifyLabels({
      ...options,
      removeLabelIds: [],
      removeLabels: []
    });
  }
  async removeLabels(options) {
    return this.modifyLabels({
      ...options,
      addLabelIds: [],
      addLabels: []
    });
  }
  async archive(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.archive(msg.id);
      }
    });
  }
  async unarchive(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.modify(msg.id, ["INBOX"], undefined);
      }
    });
  }
  async trash(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.trash(msg.id);
      }
    });
  }
  async delete(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.delete(msg.id);
      }
    });
  }
  async untrash(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.untrash(msg.id);
      }
    });
  }
  async markAsRead(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.markAsRead(msg.id);
      }
    });
  }
  async markAsUnread(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.markAsUnread(msg.id);
      }
    });
  }
  async star(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.star(msg.id);
      }
    });
  }
  async unstar(options) {
    const messages = await this.fetchMessages(options.query, options.maxResults || 100);
    return this.executeBatch(messages, {
      dryRun: options.dryRun || false,
      concurrency: options.concurrency || 10,
      onProgress: options.onProgress,
      onError: options.onError,
      operation: async (msg) => {
        await this.messages.unstar(msg.id);
      }
    });
  }
  async batchModifyLabels(options) {
    const {
      query,
      maxResults = 1000,
      addLabelIds = [],
      removeLabelIds = [],
      addLabels = [],
      removeLabels = [],
      dryRun = false
    } = options;
    const resolvedAddIds = [...addLabelIds];
    const resolvedRemoveIds = [...removeLabelIds];
    if (addLabels.length > 0 || removeLabels.length > 0) {
      const allLabels = await this.labels.list();
      const labelMap = new Map(allLabels.labels.map((l) => [l.name.toLowerCase(), l.id]));
      for (const name of addLabels) {
        const id = labelMap.get(name.toLowerCase());
        if (id)
          resolvedAddIds.push(id);
        else
          throw new Error(`Label not found: ${name}`);
      }
      for (const name of removeLabels) {
        const id = labelMap.get(name.toLowerCase());
        if (id)
          resolvedRemoveIds.push(id);
        else
          throw new Error(`Label not found: ${name}`);
      }
    }
    const messages = await this.fetchMessageIds(query, maxResults);
    const result = {
      total: messages.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      processedMessages: []
    };
    if (messages.length === 0) {
      return result;
    }
    if (dryRun) {
      result.success = messages.length;
      result.processedMessages = messages.map((id) => ({ id, threadId: "" }));
      return result;
    }
    const batchSize = 1000;
    const batches = this.chunkArray(messages, batchSize);
    for (const batch of batches) {
      try {
        await this.client.post(`/users/${this.client.getUserId()}/messages/batchModify`, {
          ids: batch,
          addLabelIds: resolvedAddIds.length > 0 ? resolvedAddIds : undefined,
          removeLabelIds: resolvedRemoveIds.length > 0 ? resolvedRemoveIds : undefined
        });
        result.success += batch.length;
        result.processedMessages.push(...batch.map((id) => ({ id, threadId: "" })));
      } catch (err) {
        result.failed += batch.length;
        const errorMessage = err instanceof Error ? err.message : String(err);
        for (const id of batch) {
          result.errors.push({ messageId: id, error: errorMessage });
        }
      }
    }
    return result;
  }
  async batchDelete(options) {
    const { query, maxResults = 1000, dryRun = false } = options;
    const messages = await this.fetchMessageIds(query, maxResults);
    const result = {
      total: messages.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      processedMessages: []
    };
    if (messages.length === 0) {
      return result;
    }
    if (dryRun) {
      result.success = messages.length;
      result.processedMessages = messages.map((id) => ({ id, threadId: "" }));
      return result;
    }
    const batchSize = 1000;
    const batches = this.chunkArray(messages, batchSize);
    for (const batch of batches) {
      try {
        await this.client.post(`/users/${this.client.getUserId()}/messages/batchDelete`, { ids: batch });
        result.success += batch.length;
        result.processedMessages.push(...batch.map((id) => ({ id, threadId: "" })));
      } catch (err) {
        result.failed += batch.length;
        const errorMessage = err instanceof Error ? err.message : String(err);
        for (const id of batch) {
          result.errors.push({ messageId: id, error: errorMessage });
        }
      }
    }
    return result;
  }
  async fetchMessages(query, maxResults) {
    const messages = [];
    let pageToken;
    while (messages.length < maxResults) {
      const response = await this.messages.list({
        q: query,
        maxResults: Math.min(100, maxResults - messages.length),
        pageToken
      });
      if (!response.messages || response.messages.length === 0) {
        break;
      }
      const metadataPromises = response.messages.map(async (m) => {
        const msg = await this.messages.get(m.id, "metadata");
        const headers = msg.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
        return {
          id: m.id,
          threadId: m.threadId,
          from: getHeader("from"),
          subject: getHeader("subject"),
          date: getHeader("date"),
          snippet: msg.snippet,
          labelIds: msg.labelIds
        };
      });
      const fetchedMessages = await Promise.all(metadataPromises);
      messages.push(...fetchedMessages);
      pageToken = response.nextPageToken;
      if (!pageToken)
        break;
    }
    return messages;
  }
  async fetchMessageIds(query, maxResults) {
    const messageIds = [];
    let pageToken;
    while (messageIds.length < maxResults) {
      const response = await this.messages.list({
        q: query,
        maxResults: Math.min(500, maxResults - messageIds.length),
        pageToken
      });
      if (!response.messages || response.messages.length === 0) {
        break;
      }
      messageIds.push(...response.messages.map((m) => m.id));
      pageToken = response.nextPageToken;
      if (!pageToken)
        break;
    }
    return messageIds;
  }
  async executeBatch(messages, options) {
    const { dryRun, concurrency, onProgress, onError, operation } = options;
    const result = {
      total: messages.length,
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      processedMessages: []
    };
    if (messages.length === 0) {
      return result;
    }
    const chunks = this.chunkArray(messages, concurrency);
    for (const chunk of chunks) {
      await Promise.all(chunk.map(async (msg) => {
        try {
          if (dryRun) {
            result.success++;
            result.processedMessages.push(msg);
          } else {
            await operation(msg);
            result.success++;
            result.processedMessages.push(msg);
          }
          if (onProgress) {
            onProgress(result.success + result.failed, result.total, msg);
          }
        } catch (err) {
          result.failed++;
          const errorMessage = err instanceof Error ? err.message : String(err);
          result.errors.push({ messageId: msg.id, error: errorMessage });
          if (onError) {
            onError(err instanceof Error ? err : new Error(errorMessage), msg);
          }
        }
      }));
    }
    return result;
  }
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0;i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// src/api/index.ts
class Gmail {
  client;
  messages;
  labels;
  threads;
  profile;
  drafts;
  filters;
  attachments;
  export;
  bulk;
  constructor() {
    this.client = new GmailClient;
    this.messages = new MessagesApi(this.client);
    this.labels = new LabelsApi(this.client);
    this.threads = new ThreadsApi(this.client);
    this.profile = new ProfileApi(this.client);
    this.drafts = new DraftsApi(this.client);
    this.filters = new FiltersApi(this.client);
    this.attachments = new AttachmentsApi(this.client);
    this.export = new ExportApi(this.client);
    this.bulk = new BulkApi(this.client);
  }
  static create() {
    return new Gmail;
  }
  getClient() {
    return this.client;
  }
}

// src/utils/output.ts
function formatOutput(data, format = "pretty") {
  switch (format) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "table":
      return formatAsTable(data);
    case "pretty":
    default:
      return formatPretty(data);
  }
}
function formatAsTable(data) {
  if (!Array.isArray(data)) {
    data = [data];
  }
  const items = data;
  if (items.length === 0) {
    return "No data";
  }
  const firstItem = items[0];
  if (!firstItem || typeof firstItem !== "object") {
    return "No data";
  }
  const keys = Object.keys(firstItem);
  const colWidths = keys.map((key) => {
    const maxValue = Math.max(key.length, ...items.map((item) => String(item[key] ?? "").length));
    return Math.min(maxValue, 40);
  });
  const header = keys.map((key, i) => key.padEnd(colWidths[i] ?? 10)).join(" | ");
  const separator = colWidths.map((w) => "-".repeat(w)).join("-+-");
  const rows = items.map((item) => keys.map((key, i) => {
    const value = String(item[key] ?? "");
    const width = colWidths[i] ?? 10;
    return value.length > width ? value.substring(0, width - 3) + "..." : value.padEnd(width);
  }).join(" | "));
  return [header, separator, ...rows].join(`
`);
}
function formatPretty(data) {
  if (Array.isArray(data)) {
    return data.map((item, i) => `${source_default.cyan(`[${i + 1}]`)} ${formatPrettyItem(item)}`).join(`

`);
  }
  return formatPrettyItem(data);
}
function formatPrettyItem(item, indent = 0) {
  if (item === null || item === undefined) {
    return source_default.gray("null");
  }
  if (typeof item !== "object") {
    return String(item);
  }
  const spaces = "  ".repeat(indent);
  const entries = Object.entries(item);
  return entries.map(([key, value]) => {
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return `${spaces}${source_default.blue(key)}: ${source_default.gray("[]")}`;
      }
      if (typeof value[0] === "object") {
        return `${spaces}${source_default.blue(key)}:
${value.map((v) => formatPrettyItem(v, indent + 1)).join(`
`)}`;
      }
      return `${spaces}${source_default.blue(key)}: ${value.join(", ")}`;
    }
    if (typeof value === "object" && value !== null) {
      return `${spaces}${source_default.blue(key)}:
${formatPrettyItem(value, indent + 1)}`;
    }
    return `${spaces}${source_default.blue(key)}: ${source_default.white(String(value))}`;
  }).join(`
`);
}
function success(message) {
  console.log(source_default.green("\u2713"), message);
}
function error(message) {
  console.error(source_default.red("\u2717"), message);
}
function warn(message) {
  console.warn(source_default.yellow("\u26A0"), message);
}
function info(message) {
  console.log(source_default.blue("\u2139"), message);
}
function print(data, format = "pretty") {
  console.log(formatOutput(data, format));
}

// src/cli/index.ts
var program2 = new Command;
program2.name("connect-gmail").description("Gmail API connector CLI - Send, read, and manage Gmail with ease").version("0.1.0").option("-f, --format <format>", "Output format (json, table, pretty)", "pretty").option("-p, --profile <profile>", "Use a specific profile").hook("preAction", (thisCommand) => {
  const opts = thisCommand.opts();
  if (opts.profile) {
    if (!profileExists(opts.profile)) {
      error(`Profile "${opts.profile}" does not exist. Create it with "connect-gmail profiles create ${opts.profile}"`);
      process.exit(1);
    }
    setProfileOverride(opts.profile);
  }
});
function getFormat(cmd) {
  const parent = cmd.parent;
  return parent?.opts().format || "pretty";
}
function requireAuth() {
  if (!isAuthenticated()) {
    error('Not authenticated. Run "connect-gmail auth login" first.');
    process.exit(1);
  }
  return Gmail.create();
}
var authCmd = program2.command("auth").description("Authentication commands");
authCmd.command("login").description("Login to Gmail via OAuth2 (opens browser) - auto-creates profile from email").action(async () => {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  if (!clientId || !clientSecret) {
    error("OAuth credentials not configured.");
    info('Run "connect-gmail config set-credentials <client-id> <client-secret>" first.');
    info("Or set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET environment variables.");
    process.exit(1);
  }
  info("Starting OAuth2 authentication flow...");
  info("A browser window will open for you to authorize the application.");
  const serverPromise = startCallbackServer();
  const authUrl = getAuthUrl();
  await open_default(authUrl);
  info("Waiting for authentication...");
  const result = await serverPromise;
  if (result.success) {
    success("Successfully authenticated!");
    try {
      setProfileOverride("default");
      if (result.tokens) {
        saveTokens(result.tokens);
      }
      const gmail = Gmail.create();
      const profile = await gmail.profile.get();
      const email = profile.emailAddress;
      const profileSlug = email.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (!profileExists(profileSlug)) {
        createProfile(profileSlug);
        info(`Created profile: ${profileSlug}`);
      }
      setCurrentProfile(profileSlug);
      setProfileOverride(profileSlug);
      setUserEmail(email);
      if (result.tokens) {
        saveTokens(result.tokens);
      }
      success(`Profile: ${profileSlug}`);
      info(`Email: ${email}`);
    } catch (err) {
      warn(`Could not auto-create profile: ${err}`);
    }
  } else {
    error(`Authentication failed: ${result.error}`);
    process.exit(1);
  }
});
authCmd.command("status").description("Check authentication status").action(async () => {
  if (isAuthenticated()) {
    const tokens = loadTokens();
    const email = getUserEmail();
    success("Authenticated");
    if (email) {
      info(`Email: ${email}`);
    }
    if (tokens) {
      const expiresIn = Math.max(0, Math.floor((tokens.expiresAt - Date.now()) / 1000 / 60));
      info(`Access token expires in: ${expiresIn} minutes`);
      info(`Has refresh token: ${tokens.refreshToken ? "Yes" : "No"}`);
    }
  } else {
    warn("Not authenticated");
    info('Run "connect-gmail auth login" to authenticate.');
  }
});
authCmd.command("logout").description("Clear stored authentication tokens").action(() => {
  clearConfig();
  success("Logged out successfully");
});
var configCmd = program2.command("config").description("Manage CLI configuration");
configCmd.command("set-credentials <clientId> <clientSecret>").description("Set OAuth2 client credentials").action((clientId, clientSecret) => {
  setCredentials(clientId, clientSecret);
  success("OAuth credentials saved successfully");
  info(`Config stored in: ${getConfigDir()}`);
});
configCmd.command("set-name <name>").description('Set your display name for sending emails (e.g., "John Doe")').action((name) => {
  setUserName(name);
  success(`Display name set to: ${name}`);
});
configCmd.command("show").description("Show current configuration").action(() => {
  const clientId = getClientId();
  const clientSecret = getClientSecret();
  const email = getUserEmail();
  const name = getUserName();
  const tokens = loadTokens();
  const settings = loadSettings();
  info(`Config directory: ${getConfigDir()}`);
  info(`Client ID: ${clientId ? `${clientId.substring(0, 20)}...` : source_default.gray("not set")}`);
  info(`Client Secret: ${clientSecret ? "********" : source_default.gray("not set")}`);
  info(`Authenticated: ${isAuthenticated() ? source_default.green("Yes") : source_default.red("No")}`);
  if (email) {
    info(`Email: ${email}`);
  }
  if (name) {
    info(`Display Name: ${name}`);
  }
  if (tokens) {
    info(`Token expires: ${new Date(tokens.expiresAt).toLocaleString()}`);
  }
  info(`Markdown enabled: ${settings.markdownEnabled ? "Yes" : "No"}`);
  info(`Append signature: ${settings.appendSignature ? "Yes" : "No"}`);
});
configCmd.command("clear").description("Clear all configuration and tokens").action(() => {
  clearConfig();
  success("Configuration cleared");
});
program2.command("me").description("Get your Gmail profile information").action(async () => {
  try {
    const gmail = requireAuth();
    const profile = await gmail.profile.get();
    print(profile, getFormat(program2));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var profilesCmd = program2.command("profiles").description("Manage multiple Gmail profiles");
profilesCmd.command("list").description("List all profiles").action(() => {
  try {
    const profiles = listProfiles();
    const current = getCurrentProfile();
    if (profiles.length === 0) {
      info("No profiles found");
      return;
    }
    success(`${profiles.length} profile(s):`);
    for (const p of profiles) {
      if (p === current) {
        info(`  ${source_default.green("\u2192")} ${p} ${source_default.gray("(current)")}`);
      } else {
        info(`    ${p}`);
      }
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
profilesCmd.command("current").description("Show current profile").action(() => {
  const current = getCurrentProfile();
  info(`Current profile: ${source_default.green(current)}`);
  info(`Config directory: ${getConfigDir()}`);
});
profilesCmd.command("create <name>").description("Create a new profile").action((name) => {
  try {
    createProfile(name);
    success(`Profile "${name}" created`);
    info(`Switch to it with: connect-gmail profiles switch ${name}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
profilesCmd.command("switch <name>").alias("use").description("Switch to a different profile").action((name) => {
  try {
    setCurrentProfile(name);
    success(`Switched to profile "${name}"`);
    info(`Config directory: ${getConfigDir()}`);
    if (isAuthenticated()) {
      const email = getUserEmail();
      if (email) {
        info(`Logged in as: ${email}`);
      }
    } else {
      warn('Profile not authenticated. Run "connect-gmail auth login"');
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
profilesCmd.command("delete <name>").description("Delete a profile").action((name) => {
  try {
    deleteProfile(name);
    success(`Profile "${name}" deleted`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
profilesCmd.command("show").description("Show all profiles with their status").action(async () => {
  try {
    const profiles = listProfiles();
    const current = getCurrentProfile();
    if (profiles.length === 0) {
      info("No profiles found");
      return;
    }
    success(`${profiles.length} profile(s):
`);
    for (const p of profiles) {
      setProfileOverride(p);
      const authenticated = isAuthenticated();
      const email = authenticated ? getUserEmail() : null;
      setProfileOverride(undefined);
      const isCurrent = p === current;
      const marker = isCurrent ? source_default.green("\u2192") : " ";
      const status = authenticated ? source_default.green("authenticated") : source_default.yellow("not authenticated");
      const emailStr = email ? source_default.gray(`(${email})`) : "";
      const currentStr = isCurrent ? source_default.gray(" [current]") : "";
      info(`  ${marker} ${p}${currentStr}`);
      info(`      Status: ${status} ${emailStr}`);
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var messagesCmd = program2.command("messages").description("Email message commands");
messagesCmd.command("list").description("List messages in your mailbox").option("-n, --max <number>", "Maximum messages to return", "10").option("-q, --query <query>", 'Gmail search query (e.g., "is:unread", "from:someone@example.com")').option("-l, --label <label>", "Filter by label ID").action(async (opts) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.messages.list({
      maxResults: parseInt(opts.max),
      q: opts.query,
      labelIds: opts.label ? [opts.label] : undefined
    });
    if (!result.messages || result.messages.length === 0) {
      info("No messages found");
      return;
    }
    success(`Found ${result.messages.length} messages:`);
    const messages = await Promise.all(result.messages.slice(0, 10).map(async (m) => {
      const msg = await gmail.messages.get(m.id, "metadata");
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
      return {
        id: m.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date"),
        snippet: msg.snippet?.substring(0, 50) + "..."
      };
    }));
    print(messages, getFormat(messagesCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("read <messageId>").description("Read a specific message").option("--body", "Include full message body").option("--html", "Show HTML body instead of plain text").option("--structure", "Show message MIME structure (for debugging)").action(async (messageId, opts) => {
  try {
    const gmail = requireAuth();
    const message = await gmail.messages.get(messageId);
    const headers = message.payload?.headers || [];
    const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
    let body = "";
    if (opts.body && message.payload) {
      const targetType = opts.html ? "text/html" : "text/plain";
      const mimeMatches = (mimeType, target) => {
        if (!mimeType)
          return false;
        const baseMime = mimeType.split(";")[0].trim().toLowerCase();
        return baseMime === target.toLowerCase();
      };
      const collectTextParts = (part, results = []) => {
        if (part.body?.data && part.mimeType) {
          const baseMime = part.mimeType.split(";")[0].trim().toLowerCase();
          if (baseMime.startsWith("text/")) {
            results.push({
              mimeType: baseMime,
              data: Buffer.from(part.body.data, "base64url").toString("utf-8")
            });
          }
        }
        if (part.parts) {
          for (const p of part.parts) {
            collectTextParts(p, results);
          }
        }
        return results;
      };
      const textParts = collectTextParts(message.payload);
      const exactMatch = textParts.find((p) => p.mimeType === targetType);
      if (exactMatch) {
        body = exactMatch.data;
      } else {
        const altMatch = textParts.find((p) => p.mimeType.startsWith("text/"));
        if (altMatch) {
          body = altMatch.data;
        }
      }
    }
    const output = {
      id: message.id,
      threadId: message.threadId,
      from: getHeader("From"),
      to: getHeader("To"),
      subject: getHeader("Subject"),
      date: getHeader("Date"),
      labels: message.labelIds
    };
    if (opts.structure) {
      output.structure = gmail.messages.getMessageStructure(message);
    }
    if (opts.body) {
      output.body = body;
    } else if (!opts.structure) {
      output.snippet = message.snippet;
    }
    print(output, getFormat(messagesCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("send").description("Send an email").requiredOption("-t, --to <email>", "Recipient email address").requiredOption("-s, --subject <subject>", "Email subject").requiredOption("-b, --body <body>", "Email body").option("--cc <emails>", "CC recipients (comma-separated)").option("--bcc <emails>", "BCC recipients (comma-separated)").option("--html", "Send as HTML email").action(async (opts) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.messages.send({
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      cc: opts.cc?.split(",").map((e) => e.trim()),
      bcc: opts.bcc?.split(",").map((e) => e.trim()),
      isHtml: opts.html
    });
    success(`Email sent successfully!`);
    info(`Message ID: ${result.id}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("trash <messageId>").description("Move a message to trash").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.trash(messageId);
    success(`Message ${messageId} moved to trash`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("delete <messageId>").description("Permanently delete a message").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.delete(messageId);
    success(`Message ${messageId} permanently deleted`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("mark-read <messageId>").description("Mark a message as read").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.markAsRead(messageId);
    success(`Message ${messageId} marked as read`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("mark-unread <messageId>").description("Mark a message as unread").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.markAsUnread(messageId);
    success(`Message ${messageId} marked as unread`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("star <messageId>").description("Star a message").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.star(messageId);
    success(`Message ${messageId} starred`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("archive <messageId>").description("Archive a message").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.archive(messageId);
    success(`Message ${messageId} archived`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("reply <messageId>").description("Reply to a message (stays in the same thread)").requiredOption("-b, --body <body>", "Reply body (supports markdown)").option("--cc <emails>", "CC recipients (comma-separated)").option("--html", "Send as HTML email").action(async (messageId, opts) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.messages.reply(messageId, {
      body: opts.body,
      cc: opts.cc?.split(",").map((e) => e.trim()),
      isHtml: opts.html
    });
    success(`Reply sent!`);
    info(`Message ID: ${result.id}`);
    info(`Thread ID: ${result.threadId}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("add-label <messageId> <labelId>").description("Add a label to a message").action(async (messageId, labelId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.addLabel(messageId, labelId);
    success(`Label ${labelId} added to message ${messageId}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
messagesCmd.command("remove-label <messageId> <labelId>").description("Remove a label from a message").action(async (messageId, labelId) => {
  try {
    const gmail = requireAuth();
    await gmail.messages.removeLabel(messageId, labelId);
    success(`Label ${labelId} removed from message ${messageId}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var labelsCmd = program2.command("labels").description("Label management commands");
labelsCmd.command("list").description("List all labels").action(async () => {
  try {
    const gmail = requireAuth();
    const result = await gmail.labels.list();
    if (!result.labels || result.labels.length === 0) {
      info("No labels found");
      return;
    }
    success(`Found ${result.labels.length} labels:`);
    const labels = result.labels.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      messagesTotal: l.messagesTotal,
      messagesUnread: l.messagesUnread
    }));
    print(labels, getFormat(labelsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
labelsCmd.command("create <name>").description("Create a new label").action(async (name) => {
  try {
    const gmail = requireAuth();
    const label = await gmail.labels.create({ name });
    success(`Label "${name}" created`);
    info(`Label ID: ${label.id}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
labelsCmd.command("delete <labelId>").description("Delete a label").action(async (labelId) => {
  try {
    const gmail = requireAuth();
    await gmail.labels.delete(labelId);
    success(`Label ${labelId} deleted`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var threadsCmd = program2.command("threads").description("Email thread commands");
threadsCmd.command("list").description("List threads in your mailbox").option("-n, --max <number>", "Maximum threads to return", "10").option("-q, --query <query>", "Gmail search query").action(async (opts) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.threads.list({
      maxResults: parseInt(opts.max),
      q: opts.query
    });
    if (!result.threads || result.threads.length === 0) {
      info("No threads found");
      return;
    }
    success(`Found ${result.threads.length} threads:`);
    print(result.threads, getFormat(threadsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
threadsCmd.command("read <threadId>").description("Read a specific thread").action(async (threadId) => {
  try {
    const gmail = requireAuth();
    const thread = await gmail.threads.get(threadId);
    const output = {
      id: thread.id,
      messagesCount: thread.messages?.length || 0,
      messages: thread.messages?.map((m) => {
        const headers = m.payload?.headers || [];
        const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
        return {
          id: m.id,
          from: getHeader("From"),
          subject: getHeader("Subject"),
          date: getHeader("Date"),
          snippet: m.snippet?.substring(0, 50) + "..."
        };
      })
    };
    print(output, getFormat(threadsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var draftsCmd = program2.command("drafts").description("Draft management commands");
draftsCmd.command("list").description("List drafts").option("-n, --max <number>", "Maximum drafts to return", "10").action(async (opts) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.drafts.list(parseInt(opts.max));
    if (!result.drafts || result.drafts.length === 0) {
      info("No drafts found");
      return;
    }
    success(`Found ${result.drafts.length} drafts:`);
    print(result.drafts, getFormat(draftsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
draftsCmd.command("create").description("Create a new draft").requiredOption("-t, --to <email>", "Recipient email address").requiredOption("-s, --subject <subject>", "Email subject").requiredOption("-b, --body <body>", "Email body").option("--cc <emails>", "CC recipients (comma-separated)").option("--html", "Send as HTML email").action(async (opts) => {
  try {
    const gmail = requireAuth();
    const draft = await gmail.drafts.create({
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      cc: opts.cc?.split(",").map((e) => e.trim()),
      isHtml: opts.html
    });
    success(`Draft created!`);
    info(`Draft ID: ${draft.id}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
draftsCmd.command("send <draftId>").description("Send a draft").action(async (draftId) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.drafts.send(draftId);
    success(`Draft sent!`);
    info(`Message ID: ${result.id}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
draftsCmd.command("delete <draftId>").description("Delete a draft").action(async (draftId) => {
  try {
    const gmail = requireAuth();
    await gmail.drafts.delete(draftId);
    success(`Draft ${draftId} deleted`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
draftsCmd.command("update <draftId>").description("Update an existing draft").requiredOption("-t, --to <email>", "Recipient email address").requiredOption("-s, --subject <subject>", "Email subject").requiredOption("-b, --body <body>", "Email body").option("--cc <emails>", "CC recipients (comma-separated)").option("--html", "Send as HTML email").action(async (draftId, opts) => {
  try {
    const gmail = requireAuth();
    const draft = await gmail.drafts.update(draftId, {
      to: opts.to,
      subject: opts.subject,
      body: opts.body,
      cc: opts.cc?.split(",").map((e) => e.trim()),
      isHtml: opts.html
    });
    success(`Draft updated!`);
    info(`Draft ID: ${draft.id}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var filtersCmd = program2.command("filters").description("Email filter management commands");
filtersCmd.command("list").description("List all email filters").action(async () => {
  try {
    const gmail = requireAuth();
    const result = await gmail.filters.list();
    if (!result.filter || result.filter.length === 0) {
      info("No filters found");
      return;
    }
    success(`Found ${result.filter.length} filters:`);
    const output = result.filter.map((f) => ({
      id: f.id,
      from: f.criteria?.from || "-",
      to: f.criteria?.to || "-",
      subject: f.criteria?.subject || "-",
      query: f.criteria?.query || "-",
      actions: Object.keys(f.action || {}).join(", ")
    }));
    print(output, getFormat(filtersCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
filtersCmd.command("get <filterId>").description("Get details of a specific filter").action(async (filterId) => {
  try {
    const gmail = requireAuth();
    const filter = await gmail.filters.get(filterId);
    print(filter, getFormat(filtersCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
filtersCmd.command("create").description("Create a new filter").option("--from <email>", "Match emails from this address").option("--to <email>", "Match emails to this address").option("--subject <text>", "Match emails with this subject").option("--query <query>", "Match emails matching this Gmail search query").option("--has-attachment", "Match emails with attachments").option("--add-label <labelId>", "Add this label to matching emails").option("--remove-label <labelId>", "Remove this label from matching emails").option("--archive", "Archive matching emails").option("--mark-read", "Mark matching emails as read").option("--star", "Star matching emails").option("--trash", "Move matching emails to trash").option("--important", "Mark matching emails as important").option("--never-spam", "Never send matching emails to spam").action(async (opts) => {
  try {
    const criteria = {};
    if (opts.from)
      criteria.from = opts.from;
    if (opts.to)
      criteria.to = opts.to;
    if (opts.subject)
      criteria.subject = opts.subject;
    if (opts.query)
      criteria.query = opts.query;
    if (opts.hasAttachment)
      criteria.hasAttachment = true;
    if (Object.keys(criteria).length === 0) {
      error("At least one filter criteria is required (--from, --to, --subject, --query, or --has-attachment)");
      process.exit(1);
    }
    const action = {};
    if (opts.addLabel)
      action.addLabelIds = [opts.addLabel];
    if (opts.removeLabel)
      action.removeLabelIds = [opts.removeLabel];
    if (opts.archive)
      action.archive = true;
    if (opts.markRead)
      action.markRead = true;
    if (opts.star)
      action.star = true;
    if (opts.trash)
      action.trash = true;
    if (opts.important)
      action.markImportant = true;
    if (opts.neverSpam)
      action.neverSpam = true;
    if (Object.keys(action).length === 0) {
      error("At least one filter action is required (--add-label, --archive, --mark-read, --star, --trash, --important, --never-spam)");
      process.exit(1);
    }
    const gmail = requireAuth();
    const filter = await gmail.filters.create({ criteria, action });
    success(`Filter created!`);
    info(`Filter ID: ${filter.id}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
filtersCmd.command("delete <filterId>").description("Delete a filter").action(async (filterId) => {
  try {
    const gmail = requireAuth();
    await gmail.filters.delete(filterId);
    success(`Filter ${filterId} deleted`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var attachmentsCmd = program2.command("attachments").description("Email attachment commands");
attachmentsCmd.command("list <messageId>").description("List attachments in a message").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    const attachments = await gmail.attachments.list(messageId);
    if (attachments.length === 0) {
      info("No attachments found in this message");
      return;
    }
    success(`Found ${attachments.length} attachment(s):`);
    const output = attachments.map((a) => ({
      filename: a.filename,
      mimeType: a.mimeType,
      size: `${Math.round(a.size / 1024)} KB`,
      attachmentId: a.attachmentId.substring(0, 20) + "..."
    }));
    print(output, getFormat(attachmentsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
attachmentsCmd.command("download <messageId>").description("Download all attachments from a message").option("-a, --attachment-id <id>", "Download specific attachment by ID").action(async (messageId, opts) => {
  try {
    const gmail = requireAuth();
    if (opts.attachmentId) {
      const attachments = await gmail.attachments.list(messageId);
      const attachment = attachments.find((a) => a.attachmentId === opts.attachmentId);
      if (!attachment) {
        error("Attachment not found");
        process.exit(1);
      }
      info(`Downloading ${attachment.filename}...`);
      const result = await gmail.attachments.download(messageId, attachment.attachmentId, attachment.filename, attachment.mimeType);
      success(`Downloaded: ${result.filename}`);
      info(`Saved to: ${result.path}`);
      info(`Size: ${Math.round(result.size / 1024)} KB`);
    } else {
      info("Downloading all attachments...");
      const results = await gmail.attachments.downloadAll(messageId);
      if (results.length === 0) {
        info("No attachments found in this message");
        return;
      }
      success(`Downloaded ${results.length} attachment(s):`);
      for (const result of results) {
        info(`  \u2022 ${result.filename} (${Math.round(result.size / 1024)} KB)`);
      }
      info(`
Saved to: ${gmail.attachments.getStoragePath(messageId)}`);
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
attachmentsCmd.command("path <messageId>").description("Show where attachments are/would be stored").action(async (messageId) => {
  const gmail = requireAuth();
  const path2 = gmail.attachments.getStoragePath(messageId);
  info(`Attachments path: ${path2}`);
});
program2.command("search <query>").description('Search messages (shortcut for "messages list -q")').option("-n, --max <number>", "Maximum messages to return", "10").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    const result = await gmail.messages.list({
      maxResults: parseInt(opts.max),
      q: query
    });
    if (!result.messages || result.messages.length === 0) {
      info(`No messages found for query: ${query}`);
      return;
    }
    success(`Found ${result.messages.length} messages:`);
    const messages = await Promise.all(result.messages.slice(0, 10).map(async (m) => {
      const msg = await gmail.messages.get(m.id, "metadata");
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
      return {
        id: m.id,
        from: getHeader("From"),
        subject: getHeader("Subject"),
        date: getHeader("Date")
      };
    }));
    print(messages, getFormat(program2));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var contactsCmd = program2.command("contacts").description("Contact management commands");
contactsCmd.command("list").description("List all saved contacts").action(() => {
  try {
    const contacts = getAllContacts();
    if (contacts.length === 0) {
      info("No contacts saved");
      return;
    }
    success(`Found ${contacts.length} contacts:`);
    const output = contacts.map((c) => ({
      email: c.email,
      name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "-",
      company: c.company || "-"
    }));
    print(output, getFormat(contactsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
contactsCmd.command("add <email>").description("Add a new contact").option("-n, --name <name>", "Full name").option("-f, --first <firstName>", "First name").option("-l, --last <lastName>", "Last name").option("-c, --company <company>", "Company name").option("--notes <notes>", "Notes").action((email, opts) => {
  try {
    const contact = {
      email,
      name: opts.name,
      firstName: opts.first,
      lastName: opts.last,
      company: opts.company,
      notes: opts.notes
    };
    saveContact(contact);
    success(`Contact ${email} saved!`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
contactsCmd.command("show <email>").description("Show a contact's details").action((email) => {
  try {
    const contact = getContact(email);
    if (!contact) {
      warn(`Contact ${email} not found`);
      return;
    }
    print(contact, getFormat(contactsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
contactsCmd.command("delete <email>").description("Delete a contact").action((email) => {
  try {
    const deleted = deleteContact(email);
    if (deleted) {
      success(`Contact ${email} deleted`);
    } else {
      warn(`Contact ${email} not found`);
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
contactsCmd.command("search <query>").description("Search contacts by name or email").action((query) => {
  try {
    const results = searchContacts(query);
    if (results.length === 0) {
      info(`No contacts found matching "${query}"`);
      return;
    }
    success(`Found ${results.length} contacts:`);
    const output = results.map((c) => ({
      email: c.email,
      name: c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim() || "-",
      company: c.company || "-"
    }));
    print(output, getFormat(contactsCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
contactsCmd.command("import <query>").description('Import contacts from email search results (e.g., "from:@company.com")').option("-n, --max <number>", "Maximum emails to search", "50").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`Searching for emails matching: ${query}`);
    const result = await gmail.messages.list({
      maxResults: parseInt(opts.max),
      q: query
    });
    if (!result.messages || result.messages.length === 0) {
      info("No messages found");
      return;
    }
    info(`Found ${result.messages.length} messages, extracting contacts...`);
    const contactsMap = new Map;
    for (const m of result.messages) {
      const msg = await gmail.messages.get(m.id, "metadata");
      const headers = msg.payload?.headers || [];
      const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
      const match = fromHeader.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+@[^>]+)>?$/);
      if (match) {
        const name = match[1]?.trim();
        const email = match[2]?.trim().toLowerCase();
        if (email && !contactsMap.has(email)) {
          contactsMap.set(email, { email, name });
        }
      }
    }
    if (contactsMap.size === 0) {
      info("No contacts found in messages");
      return;
    }
    let savedCount = 0;
    for (const contact of contactsMap.values()) {
      const domain = contact.email.split("@")[1];
      const company = domain?.split(".")[0];
      saveContact({
        email: contact.email,
        name: contact.name,
        company: company ? company.charAt(0).toUpperCase() + company.slice(1) : undefined
      });
      savedCount++;
      info(`  + ${contact.name || contact.email} <${contact.email}>`);
    }
    success(`Imported ${savedCount} contacts!`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
contactsCmd.command("from-message <messageId>").description("Save the sender of a specific message as a contact").action(async (messageId) => {
  try {
    const gmail = requireAuth();
    const msg = await gmail.messages.get(messageId, "metadata");
    const headers = msg.payload?.headers || [];
    const fromHeader = headers.find((h) => h.name.toLowerCase() === "from")?.value || "";
    const match = fromHeader.match(/^(?:"?([^"<]+)"?\s*)?<?([^>]+@[^>]+)>?$/);
    if (!match) {
      error("Could not parse sender from message");
      process.exit(1);
    }
    const name = match[1]?.trim();
    const email = match[2]?.trim().toLowerCase();
    const domain = email.split("@")[1];
    const company = domain?.split(".")[0];
    saveContact({
      email,
      name,
      company: company ? company.charAt(0).toUpperCase() + company.slice(1) : undefined
    });
    success(`Contact saved: ${name || email} <${email}>`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var settingsCmd = program2.command("settings").description("Manage CLI settings");
settingsCmd.command("show").description("Show current settings").action(() => {
  const settings = loadSettings();
  print(settings, getFormat(settingsCmd));
});
settingsCmd.command("set <key> <value>").description('Set a setting value (e.g., "markdownEnabled true")').action((key, value) => {
  try {
    const settings = loadSettings();
    const validKeys = Object.keys(settings);
    if (!validKeys.includes(key)) {
      error(`Invalid setting: ${key}`);
      info(`Valid settings: ${validKeys.join(", ")}`);
      process.exit(1);
    }
    let parsedValue;
    if (value === "true")
      parsedValue = true;
    else if (value === "false")
      parsedValue = false;
    else
      parsedValue = value;
    setSetting(key, parsedValue);
    success(`Setting ${key} = ${parsedValue}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
settingsCmd.command("set-signature <signature>").description("Set a custom email signature").action((signature) => {
  setSignature(signature);
  success("Signature saved");
});
settingsCmd.command("sync-signature").description("Fetch and save your Gmail signature").action(async () => {
  try {
    const gmail = requireAuth();
    const signature = await gmail.profile.getSignature();
    if (signature) {
      setSignature(signature);
      success("Gmail signature synced!");
      info(`Signature: ${signature.substring(0, 50)}${signature.length > 50 ? "..." : ""}`);
    } else {
      warn("No signature found in Gmail settings");
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var exportCmd = program2.command("export").description("Export emails to EML or MBOX format");
exportCmd.command("messages").description("Export messages to EML or MBOX format").option("-q, --query <query>", "Gmail search query").option("-l, --label <labelId>", "Filter by label ID").option("-n, --max <number>", "Maximum messages to export", "100").option("--format <format>", "Output format: eml or mbox", "mbox").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (opts) => {
  try {
    const gmail = requireAuth();
    info(`Exporting messages${opts.query ? ` matching "${opts.query}"` : ""}...`);
    const result = await gmail.export.exportMessages({
      query: opts.query,
      labelIds: opts.label ? [opts.label] : undefined,
      maxResults: parseInt(opts.max),
      format: opts.format,
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Exported ${result.messageCount} message(s)`);
    info(`Format: ${result.format.toUpperCase()}`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
exportCmd.command("inbox").description("Export inbox messages").option("-n, --max <number>", "Maximum messages to export", "100").option("--format <format>", "Output format: eml or mbox", "mbox").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (opts) => {
  try {
    const gmail = requireAuth();
    info("Exporting inbox messages...");
    const result = await gmail.export.exportInbox({
      maxResults: parseInt(opts.max),
      format: opts.format,
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Exported ${result.messageCount} inbox message(s)`);
    info(`Format: ${result.format.toUpperCase()}`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
exportCmd.command("sent").description("Export sent messages").option("-n, --max <number>", "Maximum messages to export", "100").option("--format <format>", "Output format: eml or mbox", "mbox").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (opts) => {
  try {
    const gmail = requireAuth();
    info("Exporting sent messages...");
    const result = await gmail.export.exportSent({
      maxResults: parseInt(opts.max),
      format: opts.format,
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Exported ${result.messageCount} sent message(s)`);
    info(`Format: ${result.format.toUpperCase()}`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
exportCmd.command("starred").description("Export starred messages").option("-n, --max <number>", "Maximum messages to export", "100").option("--format <format>", "Output format: eml or mbox", "mbox").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (opts) => {
  try {
    const gmail = requireAuth();
    info("Exporting starred messages...");
    const result = await gmail.export.exportStarred({
      maxResults: parseInt(opts.max),
      format: opts.format,
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Exported ${result.messageCount} starred message(s)`);
    info(`Format: ${result.format.toUpperCase()}`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
exportCmd.command("label <labelId>").description("Export messages from a specific label").option("-n, --max <number>", "Maximum messages to export", "100").option("--format <format>", "Output format: eml or mbox", "mbox").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (labelId, opts) => {
  try {
    const gmail = requireAuth();
    info(`Exporting messages from label "${labelId}"...`);
    const result = await gmail.export.exportLabel(labelId, {
      maxResults: parseInt(opts.max),
      format: opts.format,
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Exported ${result.messageCount} message(s)`);
    info(`Format: ${result.format.toUpperCase()}`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
exportCmd.command("message <messageId>").description("Export a single message to EML format").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (messageId, opts) => {
  try {
    const gmail = requireAuth();
    info(`Exporting message ${messageId}...`);
    const result = await gmail.export.exportMessage(messageId, {
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Message exported`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
exportCmd.command("thread <threadId>").description("Export an entire thread (conversation)").option("--format <format>", "Output format: eml or mbox", "mbox").option("-o, --output <dir>", "Output directory").option("-f, --filename <name>", "Output filename").action(async (threadId, opts) => {
  try {
    const gmail = requireAuth();
    info(`Exporting thread ${threadId}...`);
    const result = await gmail.export.exportThread(threadId, {
      format: opts.format,
      outputDir: opts.output,
      filename: opts.filename
    });
    success(`Exported ${result.messageCount} message(s) from thread`);
    info(`Format: ${result.format.toUpperCase()}`);
    info(`File: ${result.filePath}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
var bulkCmd = program2.command("bulk").description("Bulk operations on messages (using Gmail search queries)");
bulkCmd.command("preview <query>").description("Preview messages matching a Gmail search query").option("-n, --max <number>", "Maximum messages to preview", "20").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`Searching for messages matching: ${query}`);
    const result = await gmail.bulk.preview(query, parseInt(opts.max));
    if (result.messages.length === 0) {
      info("No messages found matching the query");
      return;
    }
    success(`Found ${result.total} message(s):`);
    const output = result.messages.map((m) => ({
      id: m.id,
      from: m.from || "-",
      subject: m.subject || "(no subject)",
      date: m.date || "-"
    }));
    print(output, getFormat(bulkCmd));
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("label <query>").description("Add or remove labels from messages matching a query").option("-a, --add <labels>", "Labels to add (comma-separated names or IDs)").option("-r, --remove <labels>", "Labels to remove (comma-separated names or IDs)").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing (recommended for large batches)").action(async (query, opts) => {
  try {
    if (!opts.add && !opts.remove) {
      error("At least one of --add or --remove is required");
      process.exit(1);
    }
    const gmail = requireAuth();
    const addLabels = opts.add ? opts.add.split(",").map((l) => l.trim()) : [];
    const removeLabels = opts.remove ? opts.remove.split(",").map((l) => l.trim()) : [];
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Modifying labels for messages matching: ${query}`);
    if (addLabels.length > 0)
      info(`  Adding: ${addLabels.join(", ")}`);
    if (removeLabels.length > 0)
      info(`  Removing: ${removeLabels.join(", ")}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchModifyLabels({
        query,
        maxResults: parseInt(opts.max),
        addLabels,
        removeLabels,
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.modifyLabels({
        query,
        maxResults: parseInt(opts.max),
        addLabels,
        removeLabels,
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk label modification complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0) {
      warn(`  Failed: ${result.failed}`);
      for (const err of result.errors.slice(0, 5)) {
        info(`    - ${err.messageId}: ${err.error}`);
      }
      if (result.errors.length > 5) {
        info(`    ... and ${result.errors.length - 5} more errors`);
      }
    }
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("archive <query>").description("Archive messages matching a query (remove from INBOX)").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Archiving messages matching: ${query}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchModifyLabels({
        query,
        maxResults: parseInt(opts.max),
        removeLabelIds: ["INBOX"],
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.archive({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk archive complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("trash <query>").description("Move messages matching a query to trash").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Moving to trash messages matching: ${query}`);
    const result = await gmail.bulk.trash({
      query,
      maxResults: parseInt(opts.max),
      dryRun: opts.dryRun,
      onProgress: (current, total) => {
        process.stdout.write(`\r  Progress: ${current}/${total}`);
      }
    });
    console.log();
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk trash complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("delete <query>").description("Permanently delete messages matching a query (DANGER!)").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing").option("--confirm", "Confirm permanent deletion").action(async (query, opts) => {
  try {
    if (!opts.dryRun && !opts.confirm) {
      error("Permanent deletion requires --confirm flag");
      info("Use --dry-run to preview what would be deleted");
      process.exit(1);
    }
    const gmail = requireAuth();
    warn(`${opts.dryRun ? "[DRY RUN] " : ""}PERMANENTLY DELETING messages matching: ${query}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchDelete({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.delete({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk delete complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("mark-read <query>").description("Mark messages matching a query as read").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Marking as read messages matching: ${query}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchModifyLabels({
        query,
        maxResults: parseInt(opts.max),
        removeLabelIds: ["UNREAD"],
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.markAsRead({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk mark-read complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("mark-unread <query>").description("Mark messages matching a query as unread").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Marking as unread messages matching: ${query}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchModifyLabels({
        query,
        maxResults: parseInt(opts.max),
        addLabelIds: ["UNREAD"],
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.markAsUnread({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk mark-unread complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("star <query>").description("Star messages matching a query").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Starring messages matching: ${query}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchModifyLabels({
        query,
        maxResults: parseInt(opts.max),
        addLabelIds: ["STARRED"],
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.star({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk star complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("unstar <query>").description("Remove stars from messages matching a query").option("-n, --max <number>", "Maximum messages to process", "100").option("--dry-run", "Preview changes without applying them").option("--batch", "Use Gmail batch API for faster processing").action(async (query, opts) => {
  try {
    const gmail = requireAuth();
    info(`${opts.dryRun ? "[DRY RUN] " : ""}Removing stars from messages matching: ${query}`);
    let result;
    if (opts.batch) {
      result = await gmail.bulk.batchModifyLabels({
        query,
        maxResults: parseInt(opts.max),
        removeLabelIds: ["STARRED"],
        dryRun: opts.dryRun
      });
    } else {
      result = await gmail.bulk.unstar({
        query,
        maxResults: parseInt(opts.max),
        dryRun: opts.dryRun,
        onProgress: (current, total) => {
          process.stdout.write(`\r  Progress: ${current}/${total}`);
        }
      });
      console.log();
    }
    success(`${opts.dryRun ? "[DRY RUN] " : ""}Bulk unstar complete:`);
    info(`  Total: ${result.total}`);
    info(`  Success: ${result.success}`);
    if (result.failed > 0)
      warn(`  Failed: ${result.failed}`);
  } catch (err) {
    error(String(err));
    process.exit(1);
  }
});
bulkCmd.command("help-query").description("Show Gmail search query syntax examples").action(() => {
  info(source_default.bold(`
Gmail Search Query Syntax:
`));
  info(source_default.cyan("Basic filters:"));
  info("  from:user@example.com      - Messages from a specific sender");
  info("  to:user@example.com        - Messages to a specific recipient");
  info('  subject:invoice            - Messages with "invoice" in subject');
  info(`  "exact phrase"             - Messages containing exact phrase
`);
  info(source_default.cyan("Date filters:"));
  info("  after:2024/01/01           - Messages after a date");
  info("  before:2024/12/31          - Messages before a date");
  info("  older_than:7d              - Messages older than 7 days");
  info(`  newer_than:1m              - Messages newer than 1 month
`);
  info(source_default.cyan("Label filters:"));
  info("  label:work                 - Messages with a specific label");
  info("  in:inbox                   - Messages in inbox");
  info("  in:sent                    - Messages in sent");
  info("  in:trash                   - Messages in trash");
  info(`  in:spam                    - Messages in spam
`);
  info(source_default.cyan("Status filters:"));
  info("  is:unread                  - Unread messages");
  info("  is:read                    - Read messages");
  info("  is:starred                 - Starred messages");
  info("  is:important               - Important messages");
  info(`  has:attachment             - Messages with attachments
`);
  info(source_default.cyan("Size filters:"));
  info("  larger:10M                 - Messages larger than 10MB");
  info(`  smaller:1K                 - Messages smaller than 1KB
`);
  info(source_default.cyan("Combining filters:"));
  info("  from:boss@company.com is:unread");
  info("  subject:report after:2024/01/01 before:2024/06/01");
  info("  from:@newsletter.com older_than:30d");
  info("  {from:alice@ex.com from:bob@ex.com}  - OR operator");
  info(`  -from:spam@ex.com          - NOT operator (exclude)
`);
  info(source_default.cyan("Examples:"));
  info('  bulk preview "from:newsletter@company.com older_than:30d"');
  info('  bulk archive "from:@notifications.com is:read"');
  info('  bulk trash "subject:unsubscribe older_than:90d" --dry-run');
  info('  bulk label "from:@client.com" --add "Work/Clients"');
  info('  bulk mark-read "is:unread older_than:7d" --batch');
});
program2.parse();
