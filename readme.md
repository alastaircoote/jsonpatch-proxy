# JSONPatch Proxy

This is a small Node server intended to sit between end users and a large JSON endpoint and reduce the amount of data transmitted to the user when they repeatedly hit the endpoint.

## How does it work?

The core functionality here is [JSONPatch](http://jsonpatch.com/), a JSON schema for describing changes to a JSON object. Perhaps easiest to explain with an example. When comparing:

    { "item-one": "value-a" }

and:

    {
      "item-one": "value-b",
      "item-two": "value-c"
    }

it generates the following patches:

    [
      {
        "op": "add",
        "path": "/item-two",
        "value": "value-c"
      },
      {
        "op": "replace",
        "path": "/item-one",
        "value": "value-b"
      }
    ]

in this example the patches are actually more bandwidth intensive than the original source, but you can see how this would be effective with a much larger data set. You can then use a client-side library (e.g. [this one](https://github.com/schrodinger/JSON-Patch)) to apply the patches to the data already on the user's system.

### Implementation-specific details

Right now this relies on the source server sending reliable values for the ETag header, since it uses that as the unique key for comparing versions of the data.

It also currently just stores old versions in memory. It would be better practise (especially if spinning up multiple instances of the server) to use something like Redis instead.

## Using it

To get started, do the usual steps: `git clone`, `npm install`. You can then run

    npm test

to run the (at the moment, pretty small) test suite.

To run the server itself you must set an environment variable, `TARGET_ORIGIN` to tell the server where it should be sending requests to, then run `npm start`:

    TARGET_ORIGIN=https://origin.test npm start
