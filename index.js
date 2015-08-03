'use strict';

var constant = function(x) {
  return function(y) {
    return x;
  };
};

var flip = function(f) {
  return function(x, y) {
    return f(y, x);
  };
};

var map2 = function(f, a, b) {
  return a.map(f).ap(b);
};

var mixin = function(mix, obj) {
  Object.keys(mix).forEach(function(key) {
    obj[key] = mix[key];
  });
  return obj;
};

var mixins = function(mixs, obj) {
  return mixs.reduce(flip(mixin), obj);
};

var value = function(v) {
  return Object.create(null, {
    value: {value: v},
  });
};

var enumerableValue = function(v) {
  return Object.create(null, {
    value: {value: v},
    enumerable: {value: true},
  });
};

var Stringify = Object.create(null, {
  toString: enumerableValue(function() {
    return this.type + (this.args.length > 0 ? '(' + this.args + ')' : '');
  }),
});

var Catamorphism = Object.create(null, {
  cata: enumerableValue(function(obj) {
    return obj[this.type].apply(this.type, this.args);
  }),
});

var Pair = function(x, y) {
  return mixin(Stringify, Object.create(null, {
    type: value('Pair'),
    args: value([x, y]),
    _1: enumerableValue(x),
    _2: enumerableValue(y),
  }));
};

var fst = function(pair) {
  return pair._1;
};

var snd = function(pair) {
  return pair._2;
};

var uncurryPair = function(f) {
  return function(pair) {
    return f(pair._1)(pair._2);
  };
};

var curry2 = function(f) {
  return function(x) {
    return function(y) {
      return f(x, y);
    };
  };
};

var Unit = mixin(Stringify, Object.create(null, {
  type: value('Unit'),
  args: value([]),
  ctor: value(function() {
    return Unit
  }),
}));

var Left, Right;

var Either = mixins([Catamorphism, Stringify], Object.create(null, {
  of: enumerableValue(Right),
}));

Left = function(x) {
  return Object.create(Either, {
    type: value('Left'),
    args: value([x]),
    ctor: value(Left),
    map: enumerableValue(function(_) {
      return this.ctor.apply(this, this.args);
    }),
    ap: enumerableValue(function(_) {
      return this.ctor.apply(this, this.args);
    }),
    chain: enumerableValue(function(_) {
      return this.ctor.apply(this, this.args);
    }),
  });
};

Right = function(x) {
  return Object.create(Either, {
    type: value('Right'),
    args: value([x]),
    ctor: value(Right),
    map: enumerableValue(function(f) {
      return this.ctor(f(x));
    }),
    ap: enumerableValue(function(y) {
      return y.map(x);
    }),
    chain: enumerableValue(function(f) {
      return f(x);
    }),
  });
};

var Nothing, Just;

var Maybe = Object.create(Either, {
  of: enumerableValue(Just),
});

Nothing = mixin(Left(Unit), Object.create(Maybe, {
  type: value('Nothing'),
  args: value([]),
  ctor: value(function() {
    return Nothing;
  }),
}));

Just = function(x) {
  return mixin(Right(x), Object.create(Maybe, {
    type: value('Just'),
    args: value([x]),
    ctor: value(Just),
  }));
};

var Option;
Option = function(name, parser) {
  return mixin(Stringify, Object.create(null, {
    type: value('Option'),
    args: value([name, parser]),
    ctor: value(Option),
    name: enumerableValue(name),
    parser: enumerableValue(parser),
    map: enumerableValue(function(f) {
      return Option(name, function(str) {
        return parser(str).map(f);
      });
    }),
  }));
};

var optMatches = function(opt, str) {
  return str === ('--' + opt.name);
};

var Nil, Cons;

var Parser = mixins([Catamorphism, Stringify], Object.create(null, {
  of: enumerableValue(Nil),
}));

Nil = function(x) {
  return Object.create(Parser, {
    type: value('Nil'),
    args: value([x]),
    ctor: value(Nil),
    map: enumerableValue(function(f) {
      return this.ctor(f(x));
    }),
    ap: enumerableValue(function(y) {
      return y.map(x);
    }),
  });
};

Cons = function(opt, parser) {
  return Object.create(Parser, {
    type: value('Cons'),
    args: value([opt, parser]),
    ctor: value(Cons),
    map: enumerableValue(function(f) {
      return this.ctor(opt.map(function(g) {
        return function(x) {
          return f(g(x));
        };
      }), parser);
    }),
    ap: enumerableValue(function(x) {
      return this.ctor(opt.map(uncurryPair), map2(curry2(Pair), parser, x));
    }),
  });
};

var option = function(name, parser) {
  return Cons(Option(name, parser).map(constant), Nil(Unit));
};

var readInt = function(str) {
  var parsed = parseInt(str);
  return isNaN(parsed) ? Nothing : Just(parsed);
};

var User;
User = function(name, ident) {
  return mixin(Stringify, Object.create(null, {
    type: value('User'),
    args: value([name, ident]),
    ctor: value(User),
    name: enumerableValue(name),
    ident: enumerableValue(ident),
  }));
};

var parser = map2(curry2(User), option('name', Just), option('ident', Just));

var runParser = function(parser, args) {
  return parser.cata({
    Nil: function(x) {
      return Just(Pair(x, args));
    },
    Cons: function(x, y) {
      if (args.length === 0) {
        return Nothing;
      } else {
        return stepParser(parser, args[0], args.slice(1)).chain(function(pair) {
          return runParser(pair._1, pair._2);
        });
      }
    },
  });
};

var stepParser = function(parser, arg, args) {
  return parser.cata({
    Nil: constant(Nothing),
    Cons: function(opt, rest) {
      if (optMatches(opt, arg)) {
        if (args.length === 0) {
          return Nothing;
        } else {
          return opt.parser(args[0]).map(function(f) {
            return Pair(rest.map(f), args.slice(1));
          });
        }
      } else {
        return stepParser(rest, arg, args).map(function(pair) {
          return Pair(Cons(opt, pair._1), pair._2);
        });
      }
    },
  })
}

var ex1 = runParser(parser, ['--ident', '1', '--name', 'john']).map(fst);
console.log('%s', ex1); //=> Just(User(john,1))

var ex2 = runParser(parser, ['--name', 'jacob', '--ident', '2']).map(fst);
console.log('%s', ex2); //=> Just(User(jacob,2))

var ex3 = runParser(parser, ['--name', 'jingleheimer']).map(fst);
console.log('%s', ex3); //=> Nothing

var ex4 = runParser(parser, ['--name', 'schmidt', '--verbose', '3']).map(fst);
console.log('%s', ex4); //=> Nothing
