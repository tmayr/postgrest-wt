## postgrest-webtask

### motivation

I just wanted an easy way to expose different database tables as REST service, but didn't want to spin ups servers or deployments for each database.

### how it works

It spins out a postrest daemon, forwards your request to it, and kills the process. Kind of slow, but it works for _very_ simple usecases.

### options

We map postgrest configuration through headers, this are the only exposed options for now

```
x-psqlrst-db-uri = db-uri
x-psqlrst-role = role
x-psqlrst-schema = schema
```

### usage example

```
curl <webtask url> -H "x-psqlrst-db-uri:<db-uri>"
```

### link
https://wt-tmayr-tmayr_com-0.sandbox.auth0-extend.com/postgrest-wt
