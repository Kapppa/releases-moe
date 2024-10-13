module.exports = {
  copy: obj => JSON.parse(JSON.stringify(obj)),
  anilistTitle: id => {
    try {
      const res = $http.send({
        url: 'https://graphql.anilist.co',
        method: 'POST',
        data: { query: `query{Media(id:${id}){title{english,romaji}coverImage{larger}}` },
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        }
      })
      const title = res.json.data.Media.title
      const poster = res.json.data.Media.coverImage.larger || ""
      return {
        title: title.english || title.romaji,
        poster
      }
    } catch (e) {
      console.log(e.toString())
      return id
    }
  }
}
