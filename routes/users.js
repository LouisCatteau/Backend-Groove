var express = require('express');
var router = express.Router();
require('../models/connection');
const User = require('../models/users');
const Festival = require('../models/festivals');
const { checkBody } = require('../modules/checkBody');
const uid2 = require('uid2');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const uniqid = require('uniqid');
const cloudinary = require('cloudinary').v2;



router.post('/getAllUsers', function (req, res) {
  User.find()
    .then((data) => {
      let friends = data.map((e) => {
        return ({ token: e.token, username: e.username, city: e.city, picture: e.picture })
      })
      friends = friends.filter((e) => e.token != req.body.token)
      res.json({ result: true, friends: friends })
    })
});

router.post('/getAllFriends', function (req, res) {
  User.find({ token: req.body.token })
    .populate({
      path: 'friends',
      populate: [{ path: 'styles' }, { path: 'artists' }]
    })
    .then((data) => {
      const friends = data[0].friends.map((e) => {
        return ({ username: e.username, city: e.city, picture: e.picture, token: e.token, lastname: e.lastname, firstname: e.firstname, birthdate: e.birthdate, styles: e.styles, artists: e.artists })
      })
      res.json({ result: true, friends: friends })
    })
});

router.put('/addFriend', function (req, res) {
  const { token, friendToken } = req.body;

  if (!token || !friendToken) {
    return res.status(400).json({ result: false, message: 'Tokens are required' });
  }

  User.findOne({ token: friendToken })
    .then((friendData) => {
      if (!friendData) {
        return res.status(404).json({ result: false, message: 'Friend not found' });
      }

      User.findOne({ token })
        .then((userData) => {
          if (!userData) {
            return res.status(404).json({ result: false, message: 'User not found' });
          }

          // Vérifiez si l'utilisateur et l'ami ne sont pas déjà amis
          if (userData.friends.includes(friendData._id) && friendData.friends.includes(userData._id)) {
            return res.status(400).json({ result: false, message: 'Already friends' });
          }

          // Utiliser Promise.all pour effectuer les deux mises à jour en parallèle
          Promise.all([
            User.updateOne({ token }, { $push: { friends: friendData._id } }),
            User.updateOne({ token: friendToken }, { $push: { friends: userData._id } })
          ])
            .then(() => res.json({ result: true, message: 'Ami(e) ajouté' }))
            .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de l\'ajout de l\'ami', error }));
        })
        .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la recherche de l\'utilisateur', error }));
    })
    .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la recherche de l\'ami', error }));
});

router.put('/deleteFriend', function (req, res) {
  const { token, friendToken } = req.body;

  if (!token || !friendToken) {
    return res.status(400).json({ result: false, message: 'Tokens are required' });
  }

  User.findOne({ token: friendToken })
    .then((friendData) => {
      if (!friendData) {
        return res.status(404).json({ result: false, message: 'Friend not found' });
      }

      User.findOne({ token })
        .then((userData) => {
          if (!userData) {
            return res.status(404).json({ result: false, message: 'User not found' });
          }

          // Utiliser Promise.all pour effectuer les deux mises à jour en parallèle
          Promise.all([
            User.updateOne({ token }, { $pull: { friends: friendData._id } }),
            User.updateOne({ token: friendToken }, { $pull: { friends: userData._id } })
          ])
            .then(() => res.json({ result: true, message: 'Ami(e) supprimé' }))
            .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la suppression de l\'ami', error }));
        })
        .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la recherche de l\'utilisateur', error }));
    })
    .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la recherche de l\'ami', error }));
});

router.post('/signup', (req, res) => {
  if (!checkBody(req.body, ['username', 'email', 'password'])) {
    res.json({ result: false, error: 'Missing or empty fields' });
    return;
  }
  User.findOne({ username: req.body.username, email: req.body.email }).then(data => {
    if (data === null) {
      const hash = bcrypt.hashSync(req.body.password, 10);

      /* Création de userobligate, avec les champs obligatoires */
      const userObligate = {
        username: req.body.username,
        email: req.body.email,
        password: hash,
        token: uid2(32),
      };
      /* création d'une const optional, qui va chercher la présence ou non des champs optionnels, et les ajouter à userObligate*/
      const optionalFields = ['phone', 'firstname', 'lastname', 'birthdate', 'city', 'styles', 'artists', 'friends', 'likedFestivals', 'memoriesFestivals', 'picture']
      optionalFields.forEach(field => {
        if (req.body[field]) {
          userObligate[field] = req.body[field];
        }
      });

      /* création du new user avec les champs obligatoires + ceux opitonnels trouvés dans la const userObligate */
      const newUser = new User(userObligate);

      newUser.save().then(data => {

        res.json({ result: true, token: data.token });
      });
    } else {
      res.json({ result: false, error: 'User already exists' });
    }
  });
});


router.post('/signin', (req, res) => {
  if (!checkBody(req.body, ['username', 'password'])) {
    res.json({ result: false, error: 'Missing or empty fields' });
    return;
  }

  User.findOne({ username: req.body.username }).then(data => {
    if (data && bcrypt.compareSync(req.body.password, data.password)) {
      res.json({ result: true, username: data.username, token: data.token });
    } else {
      res.json({ result: false, error: 'User not found or wrong password' });
    }
  });
});

router.post('/likeDislikeFestival', (req, res) => {
  const { festivalId, token } = req.body;

  User.findOne({ token: token }).then(user => {
    if (!user) {
      return res.json({ result: false, error: 'User not found' });
    }

    const index = user.likedFestivals.indexOf(festivalId);

    Festival.findById(festivalId).then(festival => {
      if (!festival) {
        return res.json({ result: false, error: 'Festival not found' });
      }

      if (index === -1) {
        // Festival pas dans la liste, on l'ajoute
        user.likedFestivals.push(festivalId);
        festival.nbLikes.push(token); // Ajoute le token à la nbLike
      } else {
        // Festival présent, on le retire
        user.likedFestivals.splice(index, 1);
        const tokenIndex = festival.nbLikes.indexOf(token);
        if (tokenIndex !== -1) {
          festival.nbLikes.splice(tokenIndex, 1); // Retire le token de nbLike
        }
      }

      Promise.all([user.save(), festival.save()]).then(() => {
        res.json({ result: true, message: 'Update successful', likedFestivals: user.likedFestivals });
      });
    });

  })
})

router.post('/findLiked', (req, res) => {
  const { token } = req.body;

  User.findOne({ token: token }).populate('likedFestivals')
    .then(user => {
      if (!user) {
        return res.json({ result: false, error: 'User not found' });
      }

      res.json({ result: true, festivalsLiked: user.likedFestivals })

    })
})

router.post('/checkUser', (req, res) => {
  const { username } = req.body;
  const regex_user = new RegExp("^" + username + "$", "i")
  User.findOne({ username: regex_user })
    .then(data => {
      if (data) {
        res.json({ result: true, error: "User déjà existant" }); //verifie qu'il y a un utilisateur, ce qui nous coduit à l'erreur en screen connect2
      } else {
        res.json({ result: false });
      }
    })
})

router.post('/checkMail', (req, res) => {
  const { email } = req.body;
  User.findOne({ email })
    .then(data => {
      if (data) {
        res.json({ result: true, error: "Mail déjà existant" });
      } else {
        res.json({ result: false });
      }
    })
})

router.post('/MemFest', (req, res) => {
  const { festivalId, token } = req.body;

  User.findOne({ token: token }).then(user => {
    if (!user) {
      return res.json({ result: false, error: 'User not found' });
    }

    const index = user.memoriesFestivals.indexOf(festivalId);

    if (index === -1) {
      user.memoriesFestivals.push(festivalId);
    } else {
      user.memoriesFestivals.splice(index, 1);
    }

    Promise.all([user.save()]).then(() => {
      res.json({ result: true, message: 'Update successful', memoriesFestivals: user.memoriesFestivals });
    });

  })
});

router.post('/findMemories', (req, res) => {
  const { token } = req.body;

  User.findOne({ token: token }).populate('memoriesFestivals')
    .then(user => {
      if (!user) {
        return res.json({ result: false, error: 'User not found' })
      }

      res.json({ result: true, memoriesFestivals: user.memoriesFestivals })
    })
});

router.post('/iprofil', (req, res) => {
  const { token } = req.body

  User.findOne({ token: token })
    .select('-_id -password -token -friends -likedFestivals -memoriesFestivals') // pour retirer les champs dont on a pas besoin
    .populate('styles').populate('artists')
    .then(user => {
      if (!user) {
        return res.json({ result: false, error: 'User not found' })
      }

      res.json({ result: true, user })
    })
    .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la recherche du user', error }));
})


router.post('/infoUser', (req, res) => {
  User.findById(req.body.id)
    .select('-_id -password -token -friends -likedFestivals -memoriesFestivals')
    .then(user => {
      res.json({ result: true, user })
    })
})



router.put('/update', (req, res) => {
  const { token, email, firstname, lastname, phone, city, styles, artists, birthdate, picture } = req.body;

  let updatedFields = {};
  if (email) updatedFields.email = email;
  if (firstname !== undefined) updatedFields.firstname = firstname;
  if (lastname !== undefined) updatedFields.lastname = lastname;
  if (phone !== undefined) updatedFields.phone = phone;
  if (city !== undefined) updatedFields.city = city;
  if (birthdate !== undefined) {
    if (birthdate === null) {
      updatedFields.birthdate = null;
    } else {
      updatedFields.birthdate = birthdate;
    }
  }
  if (styles) updatedFields.styles = styles;
  if (artists) updatedFields.artists = artists;
  if (picture !== undefined) updatedFields.picture = picture;

  User.findOneAndUpdate(
    { token: token },
    { $set: updatedFields },
    { new: true } // pour retourner le document mis à jour et non le document avant màj 
  ).select('-_id -password -token -friends -likedFestivals -memoriesFestivals')
    .populate('styles')
    .populate('artists')
    .then(user => {
      if (!user) {
        return res.json({ result: false, error: 'User not found' });
      }

      res.json({ result: true, user });
    })
    .catch((error) => res.status(500).json({ result: false, message: 'Erreur lors de la mise à jour', error }));
})

router.post('/photo', async (req, res) => {

  const photoPath = `/tmp/${uniqid()}.jpg`;
  const resultMove = await req.files.photoFromFront.mv(photoPath);

  if (!resultMove) {
    const resultCloudinary = await cloudinary.uploader.upload(photoPath);

    res.json({ result: true, url: resultCloudinary.secure_url });
  }

  else {
    res.json({ result: false, error: resultMove });

  };
})



module.exports = router;